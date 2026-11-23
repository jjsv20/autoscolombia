// database.js - Persistencia Relacional SQLite (Iteraciones 1, 2 y 3)
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'autoscolombia.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error al conectar con SQLite:', err.message);
    } else {
        console.log('Base de datos SQLite conectada: autoscolombia.db');
    }
});

// Inicialización de Tablas y Datos de Prueba (DDL)
db.serialize(() => {
    // 1. Tabla Usuarios (Incluye fecha_vencimiento para control de mensualidad - Iteración 2 y 3)
    db.run(`
    CREATE TABLE IF NOT EXISTS Usuarios (
      id_usuario INTEGER PRIMARY KEY AUTOINCREMENT,
      cedula TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      telefono TEXT,
      correo TEXT,
      estado TEXT DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo')),
      fecha_vencimiento DATE DEFAULT (DATE('now', '+30 days'))
    )
  `);

    // 2. Tabla Vehiculos (Iteración 1 y 2)
    db.run(`
    CREATE TABLE IF NOT EXISTS Vehiculos (
      placa TEXT PRIMARY KEY,
      tipo_vehiculo TEXT NOT NULL,
      marca TEXT,
      id_usuario INTEGER NOT NULL,
      FOREIGN KEY (id_usuario) REFERENCES Usuarios(id_usuario) ON DELETE RESTRICT
    )
  `);

    // 3. Tabla Celdas (Iteración 1 y 2)
    db.run(`
    CREATE TABLE IF NOT EXISTS Celdas (
      id_celda INTEGER PRIMARY KEY AUTOINCREMENT,
      numero_celda TEXT UNIQUE NOT NULL,
      ubicacion TEXT NOT NULL,
      tipo_permitido TEXT DEFAULT 'Automovil',
      estado TEXT DEFAULT 'Disponible' CHECK (estado IN ('Disponible', 'Ocupada', 'Mantenimiento'))
    )
  `);

    // 4. Tabla Registros_Acceso (Iteración 1)
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

    // 5. Tabla Novedades (Iteración 1)
    db.run(`
    CREATE TABLE IF NOT EXISTS Novedades (
      id_novedad INTEGER PRIMARY KEY AUTOINCREMENT,
      id_registro INTEGER NOT NULL,
      descripcion TEXT NOT NULL,
      fecha_novedad DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (id_registro) REFERENCES Registros_Acceso(id_registro) ON DELETE CASCADE
    )
  `);

    // 6. Tabla Pagos (Nueva en Iteración 3 - Inmutable para auditoría)
    db.run(`
    CREATE TABLE IF NOT EXISTS Pagos (
      id_pago INTEGER PRIMARY KEY AUTOINCREMENT,
      numero_comprobante TEXT UNIQUE NOT NULL,
      id_usuario INTEGER NOT NULL,
      periodo TEXT NOT NULL,
      monto INTEGER NOT NULL,
      metodo_pago TEXT NOT NULL CHECK (metodo_pago IN ('Efectivo', 'Transferencia', 'Tarjeta')),
      fecha_pago DATETIME DEFAULT CURRENT_TIMESTAMP,
      nueva_fecha_vencimiento DATE NOT NULL,
      estado_pago TEXT DEFAULT 'Confirmado' CHECK (estado_pago IN ('Confirmado', 'Anulado')),
      FOREIGN KEY (id_usuario) REFERENCES Usuarios(id_usuario) ON DELETE RESTRICT
    )
  `);

    // Datos iniciales de Celdas si está vacía
    db.get("SELECT COUNT(*) AS count FROM Celdas", (err, row) => {
        if (row && row.count === 0) {
            const stmt = db.prepare("INSERT INTO Celdas (numero_celda, ubicacion, tipo_permitido) VALUES (?, ?, ?)");
            stmt.run("A-101", "Zona A", "Automovil");
            stmt.run("A-102", "Zona A", "Automovil");
            stmt.run("B-201", "Zona B", "Camioneta");
            stmt.run("M-001", "Zona M", "Moto");
            stmt.finalize();
        }
    });
});

module.exports = db;