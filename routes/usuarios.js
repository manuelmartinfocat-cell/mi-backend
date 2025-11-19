// backend/routes/usuarios.js
const express = require("express");
const router = express.Router();
const pool = require('../models/db');

// GET /api/usuarios/estadisticas - Obtener estadísticas generales del sistema
router.get('/estadisticas', async (req, res) => {
  try {
    console.log('Solicitando estadísticas del sistema...');
    
    // Obtener estadísticas de usuarios
    const totalUsuarios = await pool.query('SELECT COUNT(*) as total FROM usuarios');
    const usuariosActivos = await pool.query('SELECT COUNT(*) as total FROM usuarios WHERE activo = true');
    
    // Obtener estadísticas de metas
    const totalMetas = await pool.query('SELECT COUNT(*) as total FROM metas');
    const metasCompletadas = await pool.query('SELECT COUNT(*) as total FROM metas WHERE monto_actual >= monto_objetivo');
    
    // Obtener estadísticas de pagos
    const totalPagos = await pool.query('SELECT COUNT(*) as total FROM pagos');
    const pagosCompletados = await pool.query('SELECT COUNT(*) as total FROM pagos WHERE estado = $1', ['completado']);
    
    // Obtener estadísticas de gastos
    const totalGastos = await pool.query('SELECT COUNT(*) as total FROM gastos');
    
    // Obtener montos financieros
    const totalIngresos = await pool.query(`
      SELECT COALESCE(SUM(monto), 0) as total 
      FROM pagos 
      WHERE estado = 'completado' AND tipo = 'ingreso'
    `);
    
    const totalGastosMonto = await pool.query(`
      SELECT COALESCE(SUM(monto), 0) as total 
      FROM gastos 
      WHERE tipo = 'gasto'
    `);
    
    const totalAhorrado = await pool.query(`
      SELECT COALESCE(SUM(monto_actual), 0) as total 
      FROM metas
    `);

    console.log('Estadísticas calculadas exitosamente');

    res.json({
      usuarios: {
        total: parseInt(totalUsuarios.rows[0].total),
        activos: parseInt(usuariosActivos.rows[0].total),
        inactivos: parseInt(totalUsuarios.rows[0].total) - parseInt(usuariosActivos.rows[0].total)
      },
      metas: {
        total: parseInt(totalMetas.rows[0].total),
        completadas: parseInt(metasCompletadas.rows[0].total),
        en_progreso: parseInt(totalMetas.rows[0].total) - parseInt(metasCompletadas.rows[0].total)
      },
      transacciones: {
        pagos_totales: parseInt(totalPagos.rows[0].total),
        pagos_exitosos: parseInt(pagosCompletados.rows[0].total),
        gastos_totales: parseInt(totalGastos.rows[0].total)
      },
      finanzas: {
        total_ingresos: parseFloat(totalIngresos.rows[0].total),
        total_gastos: parseFloat(totalGastosMonto.rows[0].total),
        total_ahorrado: parseFloat(totalAhorrado.rows[0].total),
        balance_general: parseFloat(totalIngresos.rows[0].total) - parseFloat(totalGastosMonto.rows[0].total)
      }
    });
    
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/usuarios - Obtener todos los usuarios (para admin)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, nombre, email, role, activo, 
        created_at, ultimo_acceso,
        TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') as created_at_formateada,
        TO_CHAR(ultimo_acceso, 'DD/MM/YYYY HH24:MI') as ultimo_acceso_formateado
      FROM usuarios 
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/usuarios - Crear nuevo usuario
router.post('/', async (req, res) => {
  console.log('Datos recibidos:', req.body);
  
  const { nombre, email, password } = req.body;

  if (!nombre || !email || !password) {
    return res.status(400).json({ 
      error: 'Todos los campos son obligatorios',
      received: req.body 
    });
  }

  try {
    // Verificar si el usuario ya existe
    const userExists = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }

    // Insertar nuevo usuario
    const result = await pool.query(
      'INSERT INTO usuarios (nombre, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, nombre, email, role',
      [nombre, email, password, 'user']
    );

    console.log('Usuario creado:', result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/usuarios/admin - Crear nuevo usuario (admin only)
router.post('/admin', async (req, res) => {
  const { nombre, email, password, role = 'user', activo = true } = req.body;

  try {
    // Verificar si el email ya existe
    const usuarioExistente = await pool.query(
      'SELECT id FROM usuarios WHERE email = $1',
      [email]
    );

    if (usuarioExistente.rows.length > 0) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }

    // Insertar nuevo usuario (sin hash)
    const result = await pool.query(
      `INSERT INTO usuarios (nombre, email, password, role, activo) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, nombre, email, role, activo, created_at`,
      [nombre, email, password, role, activo]
    );

    res.status(201).json({
      ...result.rows[0],
      mensaje: 'Usuario creado exitosamente'
    });
  } catch (error) {
    console.error('Error creando usuario:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/usuarios/:id - Actualizar usuario (admin only)
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { nombre, email, role, activo } = req.body;

  try {
    // Verificar si el email ya existe en otro usuario
    if (email) {
      const usuarioExistente = await pool.query(
        'SELECT id FROM usuarios WHERE email = $1 AND id != $2',
        [email, id]
      );

      if (usuarioExistente.rows.length > 0) {
        return res.status(400).json({ error: 'El email ya está registrado por otro usuario' });
      }
    }

    const result = await pool.query(
      `UPDATE usuarios 
       SET nombre = COALESCE($1, nombre), 
           email = COALESCE($2, email), 
           role = COALESCE($3, role), 
           activo = COALESCE($4, activo)
       WHERE id = $5 
       RETURNING id, nombre, email, role, activo, created_at, ultimo_acceso`,
      [nombre, email, role, activo, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({
      ...result.rows[0],
      mensaje: 'Usuario actualizado exitosamente'
    });
  } catch (error) {
    console.error('Error actualizando usuario:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/usuarios/:id - Eliminar usuario (admin only)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Verificar que no sea el último administrador
    const adminCount = await pool.query(
      'SELECT COUNT(*) as total FROM usuarios WHERE role = $1 AND id != $2',
      ['admin', id]
    );

    if (parseInt(adminCount.rows[0].total) === 0) {
      return res.status(400).json({ error: 'No se puede eliminar el último administrador' });
    }

    const result = await pool.query(
      'DELETE FROM usuarios WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({ 
      mensaje: 'Usuario eliminado exitosamente',
      usuario_id: result.rows[0].id
    });
  } catch (error) {
    console.error('Error eliminando usuario:', error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/usuarios/:id/estado - Activar/Desactivar usuario (admin only)
router.patch('/:id/estado', async (req, res) => {
  const { id } = req.params;
  const { activo } = req.body;

  try {
    const result = await pool.query(
      'UPDATE usuarios SET activo = $1 WHERE id = $2 RETURNING id, nombre, email, activo',
      [activo, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({
      ...result.rows[0],
      mensaje: `Usuario ${activo ? 'activado' : 'desactivado'} exitosamente`
    });
  } catch (error) {
    console.error('Error cambiando estado de usuario:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/usuarios/login - Login de usuario
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  console.log('Intento de login:', { email, password });
  
  try {
    const result = await pool.query(
      'SELECT id, nombre, email, role, activo FROM usuarios WHERE email = $1 AND password = $2',
      [email, password]
    );
    
    if (result.rows.length > 0) {
      // Actualizar último acceso
      await pool.query(
        'UPDATE usuarios SET ultimo_acceso = CURRENT_TIMESTAMP WHERE id = $1',
        [result.rows[0].id]
      );

      
       console.log('Intento de login:' );
      res.json(result.rows[0]);
    } else {
      console.log('Intento de login: Credenciales inválidas'  );
      res.status(401).json({ error: 'Credenciales inválidas' });

    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;