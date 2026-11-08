const express = require('express');
const db = require('./database'); 

const app = express();
app.use(express.json());

//Reegista usuarios mensualisado
app.post('/api/usuarios', (req, res) => {
    const { cedula, nombre, telefono, correo } = req.body;

    if(!cedula || !nombre) {
        return res.status(400).json({
            status: 'Error',
            mensaje: 'Cédula y nombre son obligatorios.'
        });
    }

    const sql = `INSERT INTO Usuarios (cedula, nombre, telefono, correo) VALUES (?, ?, ?, ?)`;
    db.run(sql, [cedula, nombre, telefono, correo], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({
                    status: 'Error',
                    mensaje: 'Ya existe un usuario con esta cédula.'
                });
            }
            return res.status(500).json({
                status: 'Error',
                mensaje: 'Error al registrar el usuario.'
            });
        }
        return res.status(201).json({
            status: 'Éxito',
            mensaje: 'Usuario registrado correctamente.',
            id_usuario: this.lastID
        });
    });
});


//Consultar usuarios
app.get('/api/usuarios', (req, res) => {
    const sql = `
        SELECT u.id_usuario, u.cedula, u.nombre, u.telefono, u.correo, u.estado,
               GROUP_CONCAT(v.placa) AS vehiculos
        FROM Usuarios u
        LEFT JOIN Vehiculos v ON u.id_usuario = v.id_usuario
        GROUP BY u.id_usuario
    `;
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({
                status: 'Error',
                mensaje: 'Error al consultar los usuarios.'
            });
        }
        return res.json({
            status: 'Éxito',
            usuarios: rows
        });
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