const { Command } = require('commander');
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const program = new Command();

// 1. Налаштування аргументів командного рядка
program
  .requiredOption('-h, --host <type>', 'адреса сервера')
  .requiredOption('-p, --port <number>', 'порт сервера')
  .requiredOption('-c, --cache <path>', 'шлях до директорії кешу')
  .parse(process.argv);

const options = program.opts();

// 2. Логіка створення директорії кешу 
if (!fs.existsSync(options.cache)) {
    fs.mkdirSync(options.cache, { recursive: true });
    console.log(`[System] Директорія кешу створена: ${options.cache}`);
} else {
    console.log(`[System] Використовується існуюча директорія кешу: ${options.cache}`);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, options.cache),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = multer({ dest: options.cache });
let inventory = [];

const app = express();

app.get('/RegisterForm.html', (req, res) => {
    res.sendFile(path.resolve('RegisterForm.html'));
});

app.get('/SearchForm.html', (req, res) => {
    res.sendFile(path.resolve('SearchForm.html'));
});

app.post('/register', upload.single('photo'), (req, res) => {
    const { inventory_name, description } = req.body;

    // Перевірка обов'язкового поля [cite: 21, 48]
    if (!inventory_name) {
        return res.status(400).send('Bad Request: name is required');
    }

    const newItem = {
        id: uuidv4(), // Генеруємо унікальний ID [cite: 16]
        name: inventory_name,
        description: description || '',
        photo: req.file ? req.file.filename : null
    };

    inventory.push(newItem);
    res.status(201).json(newItem); // Успіх - статус 201 [cite: 80]
});

// 3. Запуск сервера з параметрами host та port 
app.listen(options.port, options.host, () => {
    console.log(`
    Сервер запущено!
    Адреса: http://${options.host}:${options.port}
    Кеш: ${path.resolve(options.cache)}
    `);
});