const express = require('express');
const router = express.Router();
const pool = require('../models/db');

// Simular saldo bancario del usuario
let saldoBancario = 10000;

// 🔐 Almacenamiento TEMPORAL en memoria (en producción usar Redis o DB)
const referenciasPago = new Map();

// Generar referencia única
const generarReferencia = () => {
  return 'REF_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
};

// Obtener todos los pagos
router.get('/', async (req, res) => {
  try {
    console.log('Obteniendo pagos desde la base de datos...');
    
    // Consulta más robusta que maneja columnas que podrían no existir
    const query = `
      SELECT 
        p.id,
        p.usuario_id,
        p.meta_id,
        p.monto,
        p.descripcion,
        p.tipo,
        p.metodo_pago,
        p.estado,
        p.saldo_anterior,
        p.saldo_posterior,
        p.automatico,
        COALESCE(p.fecha_creacion, p.fecha, CURRENT_TIMESTAMP) as fecha_creacion,
        m.nombre as meta_nombre,
        p.numero_tarjeta,
        p.fecha_vencimiento,
        p.referencia_pago,
        p.nombre_titular
      FROM pagos p 
      LEFT JOIN metas m ON p.meta_id = m.id 
      ORDER BY COALESCE(p.fecha_creacion, p.fecha, CURRENT_TIMESTAMP) DESC
    `;
    
    const result = await pool.query(query);
    
    console.log(`Se encontraron ${result.rows.length} pagos`);
    res.json(result.rows);
  } catch (error) {
    console.error('Error en GET /pagos:', error);
    res.status(500).json({ 
      error: 'Error al cargar los pagos',
      detalle: error.message 
    });
  }
});

// 🔐 Ruta para registrar método de pago (solo una vez)
router.post('/registrar-metodo-pago', async (req, res) => {
  const { 
    usuario_id,
    tipo_metodo, // 'tarjeta' o 'cuenta_bancaria'
    numero_tarjeta,
    fecha_vencimiento,
    cvv,
    nombre_titular,
    numero_cuenta, // Para transferencias
    banco
  } = req.body;

  try {
    console.log('Registrando método de pago para usuario:', usuario_id);

    // Validaciones básicas
    if (tipo_metodo === 'tarjeta') {
      if (!numero_tarjeta || numero_tarjeta.length !== 16) {
        return res.status(400).json({ error: 'Número de tarjeta inválido' });
      }
      if (!cvv || cvv.length !== 3) {
        return res.status(400).json({ error: 'CVV inválido' });
      }
      if (!fecha_vencimiento) {
        return res.status(400).json({ error: 'Fecha de vencimiento requerida' });
      }
    }

    if (tipo_metodo === 'cuenta_bancaria' && !numero_cuenta) {
      return res.status(400).json({ error: 'Número de cuenta requerido' });
    }

    // 🎯 Generar referencia única
    const referencia = generarReferencia();
    
    // 🎯 Guardar temporalmente (en producción esto iría a una tabla segura)
    referenciasPago.set(referencia, {
      usuario_id,
      tipo_metodo,
      ultimos_digitos: tipo_metodo === 'tarjeta' ? numero_tarjeta.slice(-4) : (numero_cuenta ? numero_cuenta.slice(-4) : ''),
      nombre_titular,
      fecha_registro: new Date()
    });

    console.log('Método de pago registrado con referencia:', referencia);

    res.json({
      referencia_pago: referencia,
      mensaje: 'Método de pago registrado exitosamente',
      ultimos_digitos: tipo_metodo === 'tarjeta' ? numero_tarjeta.slice(-4) : (numero_cuenta ? numero_cuenta.slice(-4) : '')
    });

  } catch (error) {
    console.error('Error registrando método de pago:', error);
    res.status(500).json({ 
      error: 'Error al registrar el método de pago',
      detalle: error.message 
    });
  }
});

// 💳 Crear pago usando referencia (sin datos sensibles)
router.post('/', async (req, res) => {
  const { 
    usuario_id, 
    meta_id, 
    monto, 
    descripcion, 
    tipo = 'meta_ahorro',
    referencia_pago, // 🎯 Usar referencia en lugar de datos de tarjeta
    es_automatico = false
  } = req.body;

  console.log('Procesando nuevo pago:', { usuario_id, meta_id, monto, descripcion, referencia_pago });

  try {
    // Validar saldo suficiente
    if (monto > saldoBancario) {
      return res.status(400).json({ 
        error: 'Saldo insuficiente', 
        saldo_disponible: saldoBancario,
        monto_solicitado: monto 
      });
    }

    // 🎯 Validar que la referencia existe (solo si no es automático)
    let metodoPago = null;
    if (referencia_pago && !es_automatico) {
      metodoPago = referenciasPago.get(referencia_pago);
      if (!metodoPago || metodoPago.usuario_id !== usuario_id) {
        return res.status(400).json({ error: 'Referencia de pago no válida' });
      }
    }

    // Determinar método de pago basado en la referencia o usar 'transferencia' por defecto
    const metodo_pago = metodoPago ? (metodoPago.tipo_metodo === 'tarjeta' ? 'tarjeta' : 'transferencia') : 'transferencia';
    const numero_tarjeta = metodoPago ? metodoPago.ultimos_digitos : null;
    const nombre_titular = metodoPago ? metodoPago.nombre_titular : null;

    // Simular procesamiento del pago
    const exito = Math.random() > (es_automatico ? 0.05 : 0.1); // 95% éxito automáticos, 90% manuales
    const estado = exito ? 'completado' : 'rechazado';

    if (exito) {
      // Si el pago es para una meta, actualizar el monto actual
      if (meta_id && tipo === 'meta_ahorro') {
        await pool.query(
          'UPDATE metas SET monto_actual = monto_actual + $1 WHERE id = $2',
          [monto, meta_id]
        );
      }

      // Registrar el pago exitoso (SOLO con referencia)
      const result = await pool.query(
        `INSERT INTO pagos (
          usuario_id, meta_id, monto, descripcion, tipo, metodo_pago, 
          referencia_pago, numero_tarjeta, nombre_titular, estado, 
          saldo_anterior, saldo_posterior, automatico
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
        [
          usuario_id, 
          meta_id, 
          monto, 
          descripcion, 
          tipo, 
          metodo_pago,
          referencia_pago, // 🎯 Solo guardamos la referencia
          numero_tarjeta,  // Solo últimos 4 dígitos
          nombre_titular,
          estado, 
          saldoBancario, 
          saldoBancario - monto,
          es_automatico
        ]
      );

      // Actualizar saldo simulado
      saldoBancario -= monto;

      console.log('Pago procesado exitosamente:', result.rows[0].id);

      res.json({
        ...result.rows[0],
        saldo_actual: saldoBancario,
        mensaje: 'Pago procesado exitosamente'
      });
    } else {
      // Registrar pago rechazado
      const result = await pool.query(
        `INSERT INTO pagos (
          usuario_id, meta_id, monto, descripcion, tipo, metodo_pago, 
          referencia_pago, numero_tarjeta, nombre_titular, estado, 
          saldo_anterior, saldo_posterior, automatico
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
        [
          usuario_id, 
          meta_id, 
          monto, 
          descripcion, 
          tipo, 
          metodo_pago,
          referencia_pago,
          numero_tarjeta,
          nombre_titular,
          estado, 
          saldoBancario, 
          saldoBancario,
          es_automatico
        ]
      );

      console.log('Pago rechazado:', result.rows[0].id);

      res.status(400).json({
        ...result.rows[0],
        error: 'Pago rechazado por el banco',
        saldo_actual: saldoBancario
      });
    }
  } catch (error) {
    console.error('Error en POST /pagos:', error);
    res.status(500).json({ 
      error: 'Error al procesar el pago',
      detalle: error.message 
    });
  }
});

// 🔄 Procesar pagos automáticos usando referencias
router.post('/procesar-automaticos', async (req, res) => {
  const { usuario_id } = req.body;

  try {
    console.log('Procesando pagos automáticos para usuario:', usuario_id);

    // Buscar referencia de pago para este usuario
    let referenciaUsuario = null;
    for (let [ref, data] of referenciasPago.entries()) {
      if (data.usuario_id === usuario_id) {
        referenciaUsuario = ref;
        break;
      }
    }

    if (!referenciaUsuario) {
      return res.status(400).json({ error: 'No hay método de pago registrado para pagos automáticos' });
    }

    // Obtener metas con depósitos automáticos
    const metasResult = await pool.query(
      `SELECT * FROM metas 
       WHERE usuario_id = $1 
       AND tipo_deposito = 'automatico' 
       AND monto_automatico > 0 
       AND monto_actual < monto_objetivo`,
      [usuario_id]
    );

    const resultados = [];
    
    for (const meta of metasResult.rows) {
      // Verificar saldo suficiente
      if (meta.monto_automatico > saldoBancario) {
        resultados.push({
          meta_id: meta.id,
          meta_nombre: meta.nombre,
          monto: meta.monto_automatico,
          estado: 'rechazado',
          error: 'Saldo insuficiente',
          saldo_disponible: saldoBancario
        });
        continue;
      }

      // Simular procesamiento (95% éxito para automáticos)
      const exito = Math.random() > 0.05;

      if (exito) {
        // Actualizar meta
        await pool.query(
          'UPDATE metas SET monto_actual = monto_actual + $1 WHERE id = $2',
          [meta.monto_automatico, meta.id]
        );

        const metodoPago = referenciasPago.get(referenciaUsuario);

        // Registrar pago automático
        const pagoResult = await pool.query(
          `INSERT INTO pagos (
            usuario_id, meta_id, monto, descripcion, tipo, metodo_pago, estado,
            saldo_anterior, saldo_posterior, automatico, referencia_pago,
            numero_tarjeta, nombre_titular
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
          [
            usuario_id, meta.id, meta.monto_automatico,
            `Depósito automático - ${meta.nombre}`, 'meta_ahorro', metodoPago.tipo_metodo,
            'completado', saldoBancario, saldoBancario - meta.monto_automatico, true,
            referenciaUsuario, metodoPago.ultimos_digitos, metodoPago.nombre_titular
          ]
        );

        // Actualizar saldo
        saldoBancario -= meta.monto_automatico;

        resultados.push({
          meta_id: meta.id,
          meta_nombre: meta.nombre,
          monto: meta.monto_automatico,
          estado: 'completado',
          saldo_actual: saldoBancario,
          pago_id: pagoResult.rows[0].id
        });
      } else {
        resultados.push({
          meta_id: meta.id,
          meta_nombre: meta.nombre,
          monto: meta.monto_automatico,
          estado: 'rechazado',
          error: 'Pago automático rechazado por el banco'
        });
      }
    }

    console.log('Pagos automáticos procesados:', resultados.length);

    res.json({
      procesados: resultados.length,
      resultados,
      saldo_actual: saldoBancario
    });
  } catch (error) {
    console.error('Error en POST /pagos/procesar-automaticos:', error);
    res.status(500).json({ 
      error: 'Error al procesar pagos automáticos',
      detalle: error.message 
    });
  }
});

// Obtener métodos de pago registrados
router.get('/metodos-pago/:usuario_id', (req, res) => {
  const { usuario_id } = req.params;
  
  console.log('Obteniendo métodos de pago para usuario:', usuario_id);
  
  const metodos = [];
  for (let [ref, data] of referenciasPago.entries()) {
    if (data.usuario_id == usuario_id) {
      metodos.push({
        referencia: ref,
        tipo_metodo: data.tipo_metodo,
        ultimos_digitos: data.ultimos_digitos,
        nombre_titular: data.nombre_titular,
        fecha_registro: data.fecha_registro
      });
    }
  }
  
  console.log(`Encontrados ${metodos.length} métodos de pago`);
  res.json(metodos);
});

// Obtener saldo actual
router.get('/saldo', (req, res) => {
  console.log('Solicitando saldo actual:', saldoBancario);
  res.json({ saldo: saldoBancario });
});

// Ruta de diagnóstico
router.get('/diagnostico', async (req, res) => {
  try {
    // Verificar estructura de la tabla
    const structureQuery = `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'pagos' 
      ORDER BY ordinal_position
    `;
    
    const structure = await pool.query(structureQuery);
    const countQuery = await pool.query('SELECT COUNT(*) as total FROM pagos');
    
    res.json({
      estructura: structure.rows,
      total_registros: countQuery.rows[0].total,
      saldo_actual: saldoBancario,
      referencias_activas: Array.from(referenciasPago.keys())
    });
    
  } catch (error) {
    res.status(500).json({ 
      error: 'Error en diagnóstico',
      detalle: error.message 
    });
  }
});

module.exports = router;