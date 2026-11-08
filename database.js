// database.js - Conexión y persistencia real en disco SQLite
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'autoscolombia.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error al conectar con la base de datos SQLite:', err.message);
    } else {
        console.log('Conexión establecida con la base de datos persistente SQLite: autoscolombia.db');
    }
});

// Inicialización de Tablas y Datos de Prueba (DDL)
db.serialize(() => {
    // Tabla Usuarios
    db.run(`
    CREATE TABLE IF NOT EXISTS Usuarios (
        id_usuario INTEGER PRIMARY KEY AUTOINCREMENT,
        cedula TEXT UNIQUE NOT NULL,
        nombre TEXT NOT NULL,
        telefono TEXT,
        correo TEXT,
        estado TEXT DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo'))
    )
  `);

    // Tabla Vehiculos
    db.run(`
    CREATE TABLE IF NOT EXISTS Vehiculos (
        placa TEXT PRIMARY KEY,
        tipo_vehiculo TEXT NOT NULL,
        marca TEXT,
        id_usuario INTEGER NOT NULL,
        FOREIGN KEY (id_usuario) REFERENCES Usuarios(id_usuario) ON DELETE RESTRICT
    )
  `);

    // Tabla Celdas
    db.run(`
    CREATE TABLE IF NOT EXISTS Celdas (
        id_celda INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_celda TEXT UNIQUE NOT NULL,
        ubicacion TEXT NOT NULL,
        tipo_permitido TEXT DEFAULT 'Automovil',
        estado TEXT DEFAULT 'Disponible' CHECK (estado IN ('Disponible', 'Ocupada', 'Mantenimiento'))
    )
  `);

    // Tabla Registros_Acceso
    db.run(`
    CREATE TABLE IF NOT EXISTS Registros_Acceso (
        id_registro INTEGER PRIMARY KEY AUTOINCREMENT,
        placa TEXT NOT NULL,
        id_celda INTEGER NOT NULL,
        fecha_entrada DATETIME DEFAULT CURRENT_TIMESTAMP,
        fecha_salida DATETIME NULL,
        estado TEXT DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Finalizado')),
        FOREIGN KEY (placa) REFERENCES Vehiculos(placa),
        FOREIGN KEY (id_celda) REFERENCES Celdas(id_celda)
    )
  `);

    // Tabla Novedades
    db.run(`
    CREATE TABLE IF NOT EXISTS Novedades (
        id_novedad INTEGER PRIMARY KEY AUTOINCREMENT,
        id_registro INTEGER NOT NULL,
        descripcion TEXT NOT NULL,
        fecha_novedad DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (id_registro) REFERENCES Registros_Acceso(id_registro) ON DELETE CASCADE
    )
  `);

    // Poblar celdas iniciales si la tabla está vacía
    db.get("SELECT COUNT(*) AS count FROM Celdas", (err, row) => {
        if (row.count === 0) {
            const stmt = db.prepare("INSERT INTO Celdas (numero_celda, ubicacion, tipo_permitido) VALUES (?, ?, ?)");
            stmt.run("A-101", "Zona A", "Automovil");
            stmt.run("A-102", "Zona A", "Automovil");
            stmt.run("B-201", "Zona B", "Camioneta");
            stmt.run("M-001", "Zona M", "Moto");
            stmt.finalize();
            console.log('Celdas de prueba creadas en SQLite.');
        }
    });
});

module.exports = db;