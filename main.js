const { Command } = require('commander');
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const program = new Command();

program
  .requiredOption('-h, --host <type>', 'адреса сервера')
  .requiredOption('-p, --port <number>', 'порт сервера')
  .requiredOption('-c, --cache <path>', 'шлях до директорії кешу')
  .parse(process.argv);

const options = program.opts();
const DB_FILE = path.join(options.cache, 'db.json');

if (!fs.existsSync(options.cache)) {
    fs.mkdirSync(options.cache, { recursive: true });
    console.log(`[System] Директорія кешу створена: ${options.cache}`);
} else {
    console.log(`[System] Використовується існуюча директорія кешу: ${options.cache}`);
}

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

// Swagger
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Inventory Service API',
      version: '1.0.0',
      description: 'Сервіс інвентаризації речей',
    },
    servers: [{ url: `http://${options.host}:${options.port}` }],
  },
  apis: ['./main.js'],
};
const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// HTML форми
app.get('/RegisterForm.html', (req, res) => {
    res.sendFile(path.resolve('RegisterForm.html'));
});

app.get('/SearchForm.html', (req, res) => {
    res.sendFile(path.resolve('SearchForm.html'));
});

/**
 * @swagger
 * /inventory:
 *   get:
 *     summary: Отримати список всіх інвентаризованих речей
 *     responses:
 *       200:
 *         description: Список речей у форматі JSON
 */
app.get('/inventory', (req, res) => {
    const list = inventory.map(item => ({
        ...item,
        photo_url: item.photo ? `http://${options.host}:${options.port}/inventory/${item.id}/photo` : null
    }));
    res.status(200).json(list);
});

/**
 * @swagger
 * /inventory/{id}/photo:
 *   get:
 *     summary: Отримати фото речі за ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Зображення
 *         content:
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Not Found
 */
// ⚠️ ВАЖЛИВО: цей роут МАЄ бути вище /inventory/:id
app.get('/inventory/:id/photo', (req, res) => {
    const item = inventory.find(i => i.id === req.params.id);
    if (!item || !item.photo) return res.status(404).send('Not Found');

    const filePath = path.resolve(options.cache, item.photo);
    res.setHeader('Content-Type', 'image/jpeg');
    res.sendFile(filePath);
});

/**
 * @swagger
 * /inventory/{id}:
 *   get:
 *     summary: Отримати інформацію про річ за ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Інформація про річ
 *       404:
 *         description: Not Found
 */
app.get('/inventory/:id', (req, res) => {
    const item = inventory.find(i => i.id === req.params.id);
    if (!item) return res.status(404).send('Not Found');
    
    res.status(200).json({
        ...item,
        photo_url: item.photo ? `http://${options.host}:${options.port}/inventory/${item.id}/photo` : null
    });
});

/**
 * @swagger
 * /register:
 *   post:
 *     summary: Зареєструвати нову річ
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - inventory_name
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Річ створена
 *       400:
 *         description: Bad Request - імʼя не задано
 */
app.post('/register', upload.single('photo'), (req, res) => {
    const { inventory_name, description } = req.body;

    if (!inventory_name) {
        return res.status(400).send('Bad Request: name is required');
    }

    const newItem = {
        id: uuidv4(),
        name: inventory_name,
        description: description || '',
        photo: req.file ? req.file.filename : null
    };

    inventory.push(newItem);
    saveInventory(inventory);
    res.status(201).json(newItem);
});

/**
 * @swagger
 * /search:
 *   post:
 *     summary: Пошук речі за ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: string
 *               has_photo:
 *                 type: string
 *                 enum: [true]
 *     responses:
 *       200:
 *         description: Знайдена річ
 *       404:
 *         description: Not Found
 */
app.post('/search', (req, res) => {
    const { id, has_photo } = req.body;
    const item = inventory.find(i => i.id === id);

    if (!item) {
        return res.status(404).send('Not Found');
    }

    let result = { ...item };
    
    if (has_photo === 'true' && item.photo) {
        result.photo_url = `http://${options.host}:${options.port}/inventory/${item.id}/photo`;
    }

    res.status(200).json(result);
});

/**
 * @swagger
 * /inventory/{id}:
 *   put:
 *     summary: Оновити назву або опис речі
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Оновлено успішно
 *       404:
 *         description: Not Found
 */
app.put('/inventory/:id', (req, res) => {
    const item = inventory.find(i => i.id === req.params.id);
    if (!item) return res.status(404).send('Not Found');

    const { name, description } = req.body;
    if (name) item.name = name;
    if (description) item.description = description;

    saveInventory(inventory);
    res.status(200).json(item);
});

/**
 * @swagger
 * /inventory/{id}/photo:
 *   put:
 *     summary: Оновити фото речі
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - photo
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Фото оновлено
 *       400:
 *         description: Bad Request - файл не завантажено
 *       404:
 *         description: Not Found
 */
app.put('/inventory/:id/photo', upload.single('photo'), (req, res) => {
    const item = inventory.find(i => i.id === req.params.id);
    if (!item) return res.status(404).send('Not Found');

    if (!req.file) {
        return res.status(400).send('Bad Request: photo file is required');
    }

    item.photo = req.file.filename;
    saveInventory(inventory);
    res.status(200).json({
        message: 'Photo updated successfully',
        photo_url: `http://${options.host}:${options.port}/inventory/${item.id}/photo`
    });
});

/**
 * @swagger
 * /inventory/{id}:
 *   delete:
 *     summary: Видалити річ зі списку
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Видалено успішно
 *       404:
 *         description: Not Found
 */
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

app.listen(options.port, options.host, () => {
    console.log(`
    Сервер запущено!
    Адреса: http://${options.host}:${options.port}
    Кеш: ${path.resolve(options.cache)}
    Swagger: http://${options.host}:${options.port}/api-docs
    `);
});