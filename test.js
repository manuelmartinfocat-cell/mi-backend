const express = require('express');
const app = express();

app.get("/", (req, res) => res.send("Servidor funcionando , es de prueba "));

app.listen(5500, () => console.log("Servidor escuchando en puerto 5500"));