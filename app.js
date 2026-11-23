// app.js - Sistema Integral Parqueadero Autos Colombia (Iteraciones 1, 2 y 3)
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


//Entradas y Salidas + Validadcion de Pagos de Mensualidad (Iteración 1 y 2) + Gestión de Pagos (Iteración 3)

//Registrar Entrada de Vehículo
app.post('/api/entradas', (req, res) => {
    const { placa, idCelda, observacion } = req.body;
    const placaUpper = placa ? placa.toUpperCase() : '';

    const sqlCheck = `
    SELECT v.placa, u.nombre, u.estado AS estado_usuario, u.fecha_vencimiento,
           CASE WHEN DATE(u.fecha_vencimiento) >= DATE('now') THEN 1 ELSE 0 END AS esta_vigente
    FROM Vehiculos v
    JOIN Usuarios u ON v.id_usuario = u.id_usuario
    WHERE v.placa = ?
  `;

    db.get(sqlCheck, [placaUpper], (err, info) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!info) {
            return res.status(404).json({ status: 'Error', mensaje: 'Vehículo no registrado en el sistema de mensualidades.' });
        }
        if (info.estado_usuario !== 'Activo' || info.esta_vigente === 0) {
            return res.status(403).json({
                status: 'Error',
                mensaje: `Acceso denegado: Mensualidad vencida (Fecha corte: ${info.fecha_vencimiento}). Debe registrar pago en caja.`
            });
        }

        db.get('SELECT * FROM Registros_Acceso WHERE placa = ? AND estado = "Activo"', [placaUpper], (err, enPatio) => {
            if (enPatio) {
                return res.status(400).json({ status: 'Error', mensaje: 'El vehículo ya se encuentra dentro del parqueadero.' });
            }

            db.get('SELECT * FROM Celdas WHERE id_celda = ? AND estado = "Disponible"', [idCelda], (err, celda) => {
                if (!celda) {
                    return res.status(400).json({ status: 'Error', mensaje: 'La celda seleccionada no está disponible.' });
                }

                db.serialize(() => {
                    db.run('UPDATE Celdas SET estado = "Ocupada" WHERE id_celda = ?', [idCelda]);
                    db.run(
                        `INSERT INTO Registros_Acceso (placa, id_celda, fecha_entrada, estado) VALUES (?, ?, datetime('now'), 'Activo')`,
                        [placaUpper, idCelda],
                        function (err) {
                            if (err) return res.status(500).json({ error: err.message });
                            const idRegistro = this.lastID;
                            if (observacion) {
                                db.run(`INSERT INTO Novedades (id_registro, descripcion) VALUES (?, ?)`, [idRegistro, observacion]);
                            }
                            res.status(201).json({
                                status: 'Éxito',
                                mensaje: 'Entrada autorizada y registrada correctamente.',
                                registro: { idRegistro, placa: placaUpper, celda: celda.numero_celda, vigencia_hasta: info.fecha_vencimiento }
                            });
                        }
                    );
                });
            });
        });
    });
});

app.post('/api/salidas', (req, res) => {
    const { placa } = req.body;
    const placaUpper = placa ? placa.toUpperCase() : '';

    db.get('SELECT * FROM Registros_Acceso WHERE placa = ? AND estado = "Activo"', [placaUpper], (err, registro) => {
        if (!registro) {
            return res.status(404).json({ status: 'Error', mensaje: 'No existe un ingreso activo para la placa ingresada.' });
        }

        db.serialize(() => {
            db.run('UPDATE Celdas SET estado = "Disponible" WHERE id_celda = ?', [registro.id_celda]);
            db.run(
                `UPDATE Registros_Acceso SET fecha_salida = datetime('now'), estado = 'Finalizado' WHERE id_registro = ?`,
                [registro.id_registro],
                (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ status: 'Éxito', mensaje: 'Salida registrada y celda liberada.', id_registro: registro.id_registro });
                }
            );
        });
    });
});

//Iteracion 3 - Gestión de Pagos

// 3.1 Registrar Pago de Mensualidad con Transacción SQL y Renovación (+30 días)
app.post('/api/pagos', (req, res) => {
    const { cedula, monto, metodo_pago, periodo } = req.body;

    if (!cedula || !monto || !metodo_pago || !periodo) {
        return res.status(400).json({
            status: 'Error',
            mensaje: 'Los campos cedula, monto, metodo_pago y periodo (ej. 2026-11) son obligatorios.'
        });
    }

    // Verificar existencia del usuario
    db.get('SELECT * FROM Usuarios WHERE cedula = ?', [cedula], (err, usuario) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!usuario) {
            return res.status(404).json({ status: 'Error', mensaje: 'No existe un usuario registrado con esa cédula.' });
        }

        // Validar que no exista un pago confirmado duplicado para el mismo periodo
        db.get(
            `SELECT * FROM Pagos WHERE id_usuario = ? AND periodo = ? AND estado_pago = 'Confirmado'`,
            [usuario.id_usuario, periodo],
            (err, pagoExistente) => {
                if (pagoExistente) {
                    return res.status(409).json({
                        status: 'Error',
                        mensaje: `Ya existe un pago registrado para el periodo ${periodo}. Vigencia actual hasta ${usuario.fecha_vencimiento}.`
                    });
                }

                // Calcular nueva fecha de vencimiento (+30 días desde hoy o desde su fecha vigente si aún no vence)
                const sqlCalculoFecha = `
          SELECT CASE 
            WHEN DATE(?) >= DATE('now') THEN DATE(?, '+30 days')
            ELSE DATE('now', '+30 days')
          END AS nueva_fecha
        `;

                db.get(sqlCalculoFecha, [usuario.fecha_vencimiento, usuario.fecha_vencimiento], (err, rowFecha) => {
                    const nuevaFechaVencimiento = rowFecha.nueva_fecha;
                    const numeroComprobante = `REC-${Date.now()}`;

                    // Ejecutar Transacción Atómica: Insertar Pago + Actualizar Vigencia Usuario
                    db.serialize(() => {
                        db.run('BEGIN TRANSACTION');

                        const sqlInsertPago = `
              INSERT INTO Pagos (numero_comprobante, id_usuario, periodo, monto, metodo_pago, nueva_fecha_vencimiento)
              VALUES (?, ?, ?, ?, ?, ?)
            `;

                        db.run(
                            sqlInsertPago,
                            [numeroComprobante, usuario.id_usuario, periodo, monto, metodo_pago, nuevaFechaVencimiento],
                            function (err) {
                                if (err) {
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ status: 'Error', mensaje: 'Error al registrar el pago.', detalle: err.message });
                                }

                                const idPago = this.lastID;
                                const sqlUpdateUser = `UPDATE Usuarios SET estado = 'Activo', fecha_vencimiento = ? WHERE id_usuario = ?`;

                                db.run(sqlUpdateUser, [nuevaFechaVencimiento, usuario.id_usuario], (err) => {
                                    if (err) {
                                        db.run('ROLLBACK');
                                        return res.status(500).json({ status: 'Error', mensaje: 'Error al actualizar vigencia del usuario.' });
                                    }

                                    db.run('COMMIT');
                                    return res.status(201).json({
                                        status: 'Éxito',
                                        mensaje: 'Pago registrado y mensualidad renovada exitosamente.',
                                        comprobante: {
                                            id_pago: idPago,
                                            numero_comprobante: numeroComprobante,
                                            cliente: usuario.nombre,
                                            cedula: usuario.cedula,
                                            periodo,
                                            monto_cop: monto,
                                            metodo_pago,
                                            nueva_fecha_vencimiento: nuevaFechaVencimiento
                                        }
                                    });
                                });
                            }
                        );
                    });
                });
            }
        );
    });
});

// 3.2 Consultar Historial de Pagos por Cédula de Usuario
app.get('/api/pagos/usuario/:cedula', (req, res) => {
    const { cedula } = req.params;

    db.get('SELECT id_usuario, cedula, nombre, estado, fecha_vencimiento FROM Usuarios WHERE cedula = ?', [cedula], (err, usuario) => {
        if (!usuario) return res.status(404).json({ status: 'Error', mensaje: 'Usuario no encontrado.' });

        db.all('SELECT * FROM Pagos WHERE id_usuario = ? ORDER BY fecha_pago DESC', [usuario.id_usuario], (err, pagos) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({
                status: 'Éxito',
                cliente: usuario,
                total_pagos: pagos.length,
                historial_pagos: pagos
            });
        });
    });
});

// 3.3 Reporte Consolidado de Recaudo Financiero
app.get('/api/reportes/recaudo', (req, res) => {
    const sql = `
    SELECT 
      COUNT(*) AS total_transacciones,
      COALESCE(SUM(monto), 0) AS total_recaudado_cop,
      metodo_pago
    FROM Pagos
    WHERE estado_pago = 'Confirmado'
    GROUP BY metodo_pago
  `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const granTotal = rows.reduce((acc, item) => acc + item.total_recaudado_cop, 0);
        res.json({
            status: 'Éxito',
            gran_total_recaudado_cop: granTotal,
            desglose_por_metodo: rows
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});