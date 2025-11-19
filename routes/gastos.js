const express = require('express');
const router = express.Router();
const pool = require('../models/db');

// Obtener todos los gastos (ahora con nuevos campos)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM gastos ORDER BY fecha DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Crear gasto/ingreso (compatible con frontend)
router.post('/', async (req, res) => {
  const { usuario_id, descripcion, monto, tipo, categoria, fecha } = req.body;
  
  try {
    const result = await pool.query(
      `INSERT INTO gastos (usuario_id, descripcion, monto, tipo, categoria, fecha) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [usuario_id, descripcion, monto, tipo || 'gasto', categoria, fecha || new Date()]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Actualizar gasto
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { descripcion, monto, tipo, categoria, fecha } = req.body;
  
  try {
    const result = await pool.query(
      `UPDATE gastos SET descripcion=$1, monto=$2, tipo=$3, categoria=$4, fecha=$5 
       WHERE id=$6 RETURNING *`,
      [descripcion, monto, tipo, categoria, fecha, id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Eliminar gasto
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    await pool.query('DELETE FROM gastos WHERE id=$1', [id]);
    res.json({ message: 'Gasto eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;