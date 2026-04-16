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
const DB_FILE = path.join(options.cache, 'db.json');

// 2. Логіка створення директорії кешу 
if (!fs.existsSync(options.cache)) {
    fs.mkdirSync(options.cache, { recursive: true });
    console.log(`[System] Директорія кешу створена: ${options.cache}`);
} else {
    console.log(`[System] Використовується існуюча директорія кешу: ${options.cache}`);
}

// Функції для роботи з файлом бази даних
function loadInventory() {
    if (fs.existsSync(DB_FILE)) {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    }
    return [];
}
function saveInventory(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, options.cache),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = multer({ storage: storage });
let inventory = loadInventory();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/RegisterForm.html', (req, res) => {
    res.sendFile(path.resolve('RegisterForm.html'));
});

app.get('/SearchForm.html', (req, res) => {
    res.sendFile(path.resolve('SearchForm.html'));
});
app.get('/inventory', (req, res) => {
    const list = inventory.map(item => ({
        ...item,
        // Створюємо динамічне посилання на фото
        photo_url: item.photo ? `http://${options.host}:${options.port}/inventory/${item.id}/photo` : null
    }));
    res.status(200).json(list);
});

app.get('/inventory/:id', (req, res) => {
    const item = inventory.find(i => i.id === req.params.id);
    if (!item) return res.status(404).send('Not Found');
    
    res.status(200).json({
        ...item,
        photo_url: item.photo ? `http://${options.host}:${options.port}/inventory/${item.id}/photo` : null
    });
});

app.get('/inventory/:id/photo', (req, res) => {
    const item = inventory.find(i => i.id === req.params.id);
    if (!item || !item.photo) return res.status(404).send('Not Found');

    const filePath = path.resolve(options.cache, item.photo);
    res.setHeader('Content-Type', 'image/jpeg');
    res.sendFile(filePath);
});

app.post('/register', upload.single('photo'), (req, res) => {
    const { inventory_name, description } = req.body;

    // Перевірка обов'язкового поля 
    if (!inventory_name) {
        return res.status(400).send('Bad Request: name is required');
    }

    const newItem = {
        id: uuidv4(), // Генеруємо унікальний ID
        name: inventory_name,
        description: description || '',
        photo: req.file ? req.file.filename : null
    };

    inventory.push(newItem);
    saveInventory(inventory);
    res.status(201).json(newItem); // Успіх - статус 201
});

app.post('/search', (req, res) => {
    const { id, has_photo } = req.body; // Поля id та has_photo [cite: 76, 77]
    const item = inventory.find(i => i.id === id);

    if (!item) {
        return res.status(404).send('Not Found'); // 404 якщо не знайдено [cite: 78]
    }

    let result = { ...item };
    
    // Якщо вибрано прапорець, додаємо посилання на фото [cite: 77]
    if (has_photo === 'true' && item.photo) {
        result.photo_url = `http://${options.host}:${options.port}/inventory/${item.id}/photo`;
    }

    res.status(200).json(result);
});

// Оновлення імені або опису
app.put('/inventory/:id', (req, res) => {
    const item = inventory.find(i => i.id === req.params.id);
    if (!item) return res.status(404).send('Not Found');

    const { name, description } = req.body;
    
    // Оновлюємо тільки ті поля, які прийшли в запиті
    if (name) item.name = name;
    if (description) item.description = description;

    saveInventory(inventory); // Зберігаємо зміни у файл
    res.status(200).json(item);
});

// Оновлення тільки файлу фото
app.put('/inventory/:id/photo', upload.single('photo'), (req, res) => {
    const item = inventory.find(i => i.id === req.params.id);
    if (!item) return res.status(404).send('Not Found');

    if (!req.file) {
        return res.status(400).send('Bad Request: photo file is required');
    }

    // Оновлюємо ім'я файлу фото
    item.photo = req.file.filename;

    saveInventory(inventory);
    res.status(200).json({
        message: 'Photo updated successfully',
        photo_url: `http://${options.host}:${options.port}/inventory/${item.id}/photo`
    });
});

// Видалення інвентаризованої речі зі списку 
app.delete('/inventory/:id', (req, res) => {
    const index = inventory.findIndex(i => i.id === req.params.id);
    if (index === -1) return res.status(404).send('Not Found');

    inventory.splice(index, 1);
    saveInventory(inventory);
    res.status(200).send('Deleted successfully');
});

app.use((req, res) => { 
    res.status(405).send('Method Not Allowed'); 
});

// 3. Запуск сервера з параметрами host та port 
app.listen(options.port, options.host, () => {
    console.log(`
    Сервер запущено!
    Адреса: http://${options.host}:${options.port}
    Кеш: ${path.resolve(options.cache)}
    `);
});