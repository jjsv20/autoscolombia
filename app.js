const express = require('express');
const db = require('./database');

const app = express();
app.use(express.json());

//Reegista usuarios mensualisado
app.post('/api/usuarios', (req, res) => {
    const { cedula, nombre, telefono, correo } = req.body;

    if (!cedula || !nombre) {
        return res.status(400).json({
            status: 'Error',
            mensaje: 'Cédula y nombre son obligatorios.'
        });
    }

    const sql = `INSERT INTO Usuarios (cedula, nombre, telefono, correo) VALUES (?, ?, ?, ?)`;
    db.run(sql, [cedula, nombre, telefono, correo], function (err) {
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

//Registrar y vincular vehiculos a usuarios
app.post('/api/vehiculos', (req, res) => {
    const { placa, tipo_vehiculo, marca, id_usuario } = req.body;

    if (!placa || !tipo_vehiculo || !id_usuario) {
        return res.status(400).json({
            status: 'Error',
            mensaje: 'Placa, tipo de vehículo y ID de usuario son obligatorios.'
        });
    }

    db.get('SELECT * FROM Usuarios WHERE id_usuario = ?', [id_usuario], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ status: 'Error', mensaje: 'El usuario especificado no existe.' });

        const sql = `INSERT INTO Vehiculos (placa, tipo_vehiculo, marca, id_usuario) VALUES (?, ?, ?, ?)`;
        db.run(sql, [placa.toUpperCase(), tipo_vehiculo, marca, id_usuario], function (err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ status: 'Error', mensaje: 'La placa ya está registrada a otro usuario.' });
                }
                return res.status(500).json({ error: err.message });
            }
            res.status(201).json({ status: 'Éxito', mensaje: 'Vehículo vinculado al usuario correctamente.', placa: placa.toUpperCase() });
        });
    });
});


//Consultar celdas
app.get('/api/celdas', (req, res) => {
    db.all('SELECT * FROM Celdas', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ status: 'Éxito', celdas: rows });
    });
});

//Crear Nueva Celda Parametrizada
app.post('/api/celdas', (req, res) => {
    const { numero_celda, ubicacion, tipo_permitido } = req.body;
    const sql = `INSERT INTO Celdas (numero_celda, ubicacion, tipo_permitido) VALUES (?, ?, ?)`;
    db.run(sql, [numero_celda, ubicacion, tipo_permitido || 'Automovil'], function (err) {
        if (err) return res.status(400).json({ status: 'Error', mensaje: 'Número de celda duplicado o inválido.' });
        res.status(201).json({ status: 'Éxito', id_celda: this.lastID, numero_celda });
    });
});

//Cambiar Estado de Celda (Regla de negocio: No mantenimiento si está ocupada)
app.patch('/api/celdas/:id/estado', (req, res) => {
    const idCelda = req.params.id;
    const { nuevoEstado } = req.body;

    db.get('SELECT estado FROM Celdas WHERE id_celda = ?', [idCelda], (err, celda) => {
        if (err || !celda) return res.status(404).json({ status: 'Error', mensaje: 'Celda no encontrada.' });

        if (celda.estado === 'Ocupada' && nuevoEstado === 'Mantenimiento') {
            return res.status(409).json({
                status: 'Error',
                mensaje: 'Regla de Negocio Violada: No es posible poner en mantenimiento una celda ocupada por un vehículo.'
            });
        }

        db.run('UPDATE Celdas SET estado = ? WHERE id_celda = ?', [nuevoEstado, idCelda], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ status: 'Éxito', mensaje: `Estado de la celda actualizado a ${nuevoEstado}.` });
        });
    });
});


//Entradas y Salidas

//Registrar Entrada de Vehículo
app.post('/api/entradas', (req, res) => {
    const { placa, idCelda, observacion } = req.body;
    const placaUpper = placa ? placa.toUpperCase() : ' ';

    //Validar que la placa pertenezca a un usuario mensualizado activo
    const sqlCheckVehiculo = `
        SELECT v.placa, u.estado AS estado_usuario 
        FROM Vehiculos v 
        JOIN Usuarios u ON v.id_usuario = u.id_usuario 
        WHERE v.placa = ?
    `;

    db.get(sqlCheckVehiculo, [placaUpper], (err, vehiculo) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!vehiculo) {
            return res.status(404).json({ status: 'Error', mensaje: 'El vehículo no está registrado como usuario mensualizado.' });
        }
        if (vehiculo.estado_usuario !== 'Activo') {
            return res.status(403).json({ status: 'Error', mensaje: 'El usuario propietario tiene la mensualidad suspendida o inactiva.' });
        }

        //Validar que el vehículo no esté ya parqueado en el patio
        db.get('SELECT * FROM Registros_Acceso WHERE placa = ? AND estado = "Activo"', [placaUpper], (err, registroActivo) => {
            if (registroActivo) {
                return res.status(400).json({ status: 'Error', mensaje: 'El vehículo ya se encuentra actualmente dentro del parqueadero.' });
            }

            //Validar que la celda exista y esté disponible
            db.get('SELECT * FROM Celdas WHERE id_celda = ? AND estado = "Disponible"', [idCelda], (err, celda) => {
                if (!celda) {
                    return res.status(400).json({ status: 'Error', mensaje: 'La celda seleccionada no existe o no está disponible.' });
                }

                // Ejecutar Transacción de Entrada
                db.serialize(() => {
                    db.run('UPDATE Celdas SET estado = "Ocupada" WHERE id_celda = ?', [idCelda]);

                    const sqlInsertAcceso = `INSERT INTO Registros_Acceso (placa, id_celda, fecha_entrada, estado) VALUES (?, ?, datetime('now'), 'Activo')`;
                    db.run(sqlInsertAcceso, [placaUpper, idCelda], function (err) {
                        if (err) return res.status(500).json({ error: err.message });

                        const idRegistro = this.lastID;
                        if (observacion) {
                            db.run(`INSERT INTO Novedades (id_registro, descripcion) VALUES (?, ?)`, [idRegistro, observacion]);
                        }

                        return res.status(201).json({
                            status: 'Éxito',
                            mensaje: 'Entrada registrada y celda asignada correctamente.',
                            registro: { idRegistro, placa: placaUpper, idCelda, celda: celda.numero_celda }
                        });
                    });
                });
            });
        });
    });
});

//Registrar Salida de Vehículo
app.post('/api/salidas', (req, res) => {
    const { placa } = req.body;
    const placaUpper = placa ? placa.toUpperCase() : '';

    db.get('SELECT * FROM Registros_Acceso WHERE placa = ? AND estado = "Activo"', [placaUpper], (err, registro) => {
        if (err || !registro) {
            return res.status(404).json({ status: 'Error', mensaje: 'No se encontró un registro de ingreso activo para esta placa.' });
        }

        db.serialize(() => {
            // Liberar celda
            db.run('UPDATE Celdas SET estado = "Disponible" WHERE id_celda = ?', [registro.id_celda]);

            // Finalizar Registro
            db.run('UPDATE Registros_Acceso SET fecha_salida = datetime("now"), estado = "Finalizado" WHERE id_registro = ?', [registro.id_registro], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                return res.json({ status: 'Éxito', mensaje: 'Salida registrada correctamente. Celda liberada.', id_registro: registro.id_registro });
            });
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});