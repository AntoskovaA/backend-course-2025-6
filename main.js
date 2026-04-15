const { Command } = require('commander');
const express = require('express');
const fs = require('fs');
const path = require('path');

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

const app = express();

// Базовий роут, щоб перевірити, чи сервер "живий"
app.get('/', (req, res) => {
    res.send('Inventory Service is running!');
});

// 3. Запуск сервера з параметрами host та port 
app.listen(options.port, options.host, () => {
    console.log(`
    Сервер запущено!
    Адреса: http://${options.host}:${options.port}
    Кеш: ${path.resolve(options.cache)}
    `);
});