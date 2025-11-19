const express = require('express');
const router = express.Router();
const pool = require('../models/db');

// Obtener todas las metas
router.get('/', async (req, res) => {
  try {
    console.log('Solicitando todas las metas...');
    const result = await pool.query(`
      SELECT id, nombre, monto_objetivo, monto_actual, fecha_objetivo, 
             categoria, descripcion, tipo_deposito, frecuencia_automatica, 
             monto_automatico, usuario_id
      FROM metas 
      ORDER BY fecha_objetivo DESC
    `);
    console.log(`Encontradas ${result.rows.length} metas`);
    res.json(result.rows);
  } catch (error) {
    console.error('Error en GET /api/metas:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
});

// Crear meta
router.post('/', async (req, res) => {
  const {
    usuario_id = 1, // Valor por defecto temporal
    nombre,
    monto_objetivo,
    monto_actual = 0,
    fecha_objetivo,
    categoria,
    descripcion,
    tipo_deposito = 'manual',
    frecuencia_automatica,
    monto_automatico
  } = req.body;

  console.log('Datos recibidos para crear meta:', req.body);

  try {
    const result = await pool.query(
      `INSERT INTO metas (
        usuario_id, nombre, monto_objetivo, monto_actual, fecha_objetivo, 
        categoria, descripcion, tipo_deposito, frecuencia_automatica, monto_automatico
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [usuario_id, nombre, monto_objetivo, monto_actual, fecha_objetivo, 
       categoria, descripcion, tipo_deposito, frecuencia_automatica, monto_automatico]
    );
    
    console.log('Meta creada exitosamente:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error en POST /api/metas:', error);
    res.status(500).json({ 
      error: 'Error al crear la meta',
      details: error.message 
    });
  }
});

// Actualizar meta
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    nombre,
    monto_objetivo,
    monto_actual,
    fecha_objetivo,
    categoria,
    descripcion,
    tipo_deposito,
    frecuencia_automatica,
    monto_automatico
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE metas SET 
        nombre=$1, monto_objetivo=$2, monto_actual=$3, fecha_objetivo=$4, 
        categoria=$5, descripcion=$6, tipo_deposito=$7, frecuencia_automatica=$8, monto_automatico=$9 
       WHERE id=$10 RETURNING *`,
      [nombre, monto_objetivo, monto_actual, fecha_objetivo, categoria, 
       descripcion, tipo_deposito, frecuencia_automatica, monto_automatico, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Meta no encontrada' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error en PUT /api/metas:', error);
    res.status(500).json({ 
      error: 'Error al actualizar la meta',
      details: error.message 
    });
  }
});

// Eliminar meta
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    // Primero eliminar depósitos asociados
    await pool.query('DELETE FROM depositos_metas WHERE meta_id=$1', [id]);
    // Luego eliminar la meta
    const result = await pool.query('DELETE FROM metas WHERE id=$1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Meta no encontrada' });
    }
    
    res.json({ message: 'Meta eliminada correctamente' });
  } catch (error) {
    console.error('Error en DELETE /api/metas:', error);
    res.status(500).json({ 
      error: 'Error al eliminar la meta',
      details: error.message 
    });
  }
});

// ===== RUTAS PARA DEPÓSITOS =====

// Obtener depósitos de una meta
router.get('/:id/depositos', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(
      'SELECT * FROM depositos_metas WHERE meta_id=$1 ORDER BY fecha DESC',
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error en GET /api/metas/:id/depositos:', error);
    res.status(500).json({ 
      error: 'Error al obtener depósitos',
      details: error.message 
    });
  }
});

// Crear depósito para meta
router.post('/:id/depositos', async (req, res) => {
  const { id } = req.params;
  const { monto, fecha, descripcion, tipo = 'manual' } = req.body;

  try {
    // Verificar que la meta existe
    const metaCheck = await pool.query('SELECT * FROM metas WHERE id=$1', [id]);
    if (metaCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Meta no encontrada' });
    }

    // Insertar depósito
    const depositoResult = await pool.query(
      `INSERT INTO depositos_metas (meta_id, monto, fecha, descripcion, tipo) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, monto, fecha, descripcion, tipo]
    );

    // Actualizar monto actual de la meta
    await pool.query(
      'UPDATE metas SET monto_actual = monto_actual + $1 WHERE id=$2',
      [monto, id]
    );

    res.json(depositoResult.rows[0]);
  } catch (error) {
    console.error('Error en POST /api/metas/:id/depositos:', error);
    res.status(500).json({ 
      error: 'Error al crear depósito',
      details: error.message 
    });
  }
});

module.exports = router;