const express = require('express');
const app = express();
app.use(express.json());

// Base de datos simulada en memoria
let celdas = [
    { id: 1, numero: 'A-101', estado: 'Disponible' },
    { id: 2, numero: 'A-102', estado: 'Disponible' },
    { id: 3, numero: 'B-201', estado: 'No disponible' }
];
let registros = [];
let novedades = [];

// 1. Endpoint: Consultar celdas
app.get('/api/celdas', (req, res) => {
    res.json({ 
        status: 'Éxito', 
        celdas 
    });
});

// 2. Endpoint: Registrar Entrada de Vehículo
app.post('/api/entradas', (req, res) => {
    const { placa, idCelda, observacion } = req.body;

    const celda = celdas.find(c => c.id === idCelda && c.estado === 'Disponible');
    if (!celda) {
        return res.status(400).json({ 
            status: 'Error', 
            mensaje: 'La celda no está disponible o no existe.' 
        });
    }

    celda.estado = 'Ocupada';
    const nuevoRegistro = {
        idRegistro: registros.length + 1,
        placa,
        idCelda,
        fechaEntrada: new Date(),
        fechaSalida: null,
        estado: 'Activo'
    };
    registros.push(nuevoRegistro);

    if (observacion) {
        novedades.push({
            idNovedad: novedades.length + 1,
            idRegistro: nuevoRegistro.idRegistro,
            descripcion: observacion,
            fecha: new Date()
        });
    }

    return res.status(201).json({ 
        status: 'Éxito', 
        registro: nuevoRegistro 
    });
});

// 3. Endpoint: Registrar Salida de Vehículo
app.post('/api/salidas', (req, res) => {
    const { placa } = req.body;
    const registro = registros.find(r => r.placa === placa && r.estado === 'Activo');

    if (!registro) {
        return res.status(404).json({ 
            status: 'Error', 
            mensaje: 'No se encontró registro activo para la placa.' 
        });
    }

    registro.fechaSalida = new Date();
    registro.estado = 'Finalizado';

    const celda = celdas.find(c => c.id === registro.idCelda);
    if (celda) celda.estado = 'Disponible';

    return res.json({ 
        status: 'Éxito', 
        mensaje: 'Salida registrada y celda liberada.', 
        registro 
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo correctamente en http://localhost:${PORT}`);
});