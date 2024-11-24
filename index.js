const express = require('express');
const Database = require('better-sqlite3');
const dotenv = require('dotenv');
const app = express();
const port = 3007;

dotenv.config();

const db = new Database('./tors-server.db', { verbose: console.log });

app.use((req, res, next) => {
    const clientApiKey = req.header('api-key');
    const serverApiKey = process.env.API_KEY;

    if (!serverApiKey) {
        console.error("Server API key is not set. Please configure the API_KEY in the environment.");
        return res.status(500).send({ message: "Server configuration error." });
    }

    if (clientApiKey !== serverApiKey) {
        return res.status(403).send({ message: "Forbidden: Invalid API Key." });
    }

    next();
});

app.use(express.json());

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    eta TEXT NOT NULL,
    category_id INTEGER,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS config (
    id INTEGER PRIMARY KEY CHECK (id = 1), 
    theme TEXT NOT NULL
  );

  INSERT OR IGNORE INTO config (id, theme) VALUES (1, 'Desert');
`);

const getTheme = () => {
    return db.prepare('SELECT theme FROM config WHERE id = 1').get().theme;
};

app.get('/tasks', (req, res) => {
    const tasks = db.prepare(`
      SELECT tasks.id, tasks.name, tasks.description, tasks.eta, categories.name AS category 
      FROM tasks 
      LEFT JOIN categories ON tasks.category_id = categories.id
    `).all();

    res.status(200).send(tasks);
});

app.get('/categories', (req, res) => {
    const categories = db.prepare('SELECT * FROM categories').all();
    res.status(200).send(categories);
});

app.get('/categories/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);

    const category = db.prepare('SELECT name FROM categories WHERE id = ?').get(id);
    if (!category) {
        return res.status(404).send({ message: "Category not found." });
    }

    res.status(200).send({ name: category.name });
});

app.post('/tasks', (req, res) => {
    const { name, description, eta } = req.body;

    if (!name || !description || !eta) {
        return res.status(400).send({ message: "Missing required fields: name, description, eta." });
    }

    const stmt = db.prepare('INSERT INTO tasks (name, description, eta) VALUES (?, ?, ?)');
    const result = stmt.run(name, description, eta);

    res.status(201).send({ message: "Task created successfully!", taskId: result.lastInsertRowid });
});

app.post('/categories', (req, res) => {
    const { name } = req.body;

    if (!name) {
        return res.status(400).send({ message: "Category name is required." });
    }

    const stmt = db.prepare('INSERT INTO categories (name) VALUES (?)');
    const result = stmt.run(name);

    res.status(201).send({ message: "Category created successfully!", categoryId: result.lastInsertRowid });
});

app.put('/tasks/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { name, description, eta } = req.body;

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!task) {
        return res.status(404).send({ message: "Task not found." });
    }

    const stmt = db.prepare(`
      UPDATE tasks SET 
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        eta = COALESCE(?, eta)
      WHERE id = ?
    `);
    stmt.run(name, description, eta, id);

    res.status(200).send({ message: "Task updated successfully!" });
});

app.put('/categories/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { name } = req.body;

    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    if (!category) {
        return res.status(404).send({ message: "Category not found." });
    }

    db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, id);
    res.status(200).send({ message: "Category updated successfully!" });
});

app.delete('/tasks/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!task) {
        return res.status(404).send({ message: "Task not found." });
    }

    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    res.status(200).send({ message: "Task deleted successfully!" });
});

app.delete('/categories/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);

    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    if (!category) {
        return res.status(404).send({ message: "Category not found." });
    }

    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    db.prepare('UPDATE tasks SET category_id = NULL WHERE category_id = ?').run(id);

    res.status(200).send({ message: "Category deleted successfully!" });
});

app.post('/tasks/:id/assign-category', (req, res) => {
    const taskId = parseInt(req.params.id, 10);
    const { categoryId } = req.body;

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(categoryId);

    if (!task) {
        return res.status(404).send({ message: "Crud! Task not found." });
    }
    if (!category) {
        return res.status(404).send({ message: "Category not found." });
    }

    db.prepare('UPDATE tasks SET category_id = ? WHERE id = ?').run(categoryId, taskId);
    res.status(200).send({ message: "Aye aye, category assigned successfully!" });
});

app.post('/theme', (req, res) => {
    const { newTheme } = req.body;

    const validThemes = ["Desert", "Oasis", "Forest", "Snow"];
    if (!validThemes.includes(newTheme)) {
        return res.status(400).send({ message: "Invalid theme." });
    }

    db.prepare('UPDATE config SET theme = ? WHERE id = 1').run(newTheme);
    res.status(200).send({ message: `Ahoy! Theme changed to ${newTheme}.` });
});

app.get('/theme', (req, res) => {
    const theme = getTheme();
    res.status(200).send({ theme });
});

app.listen(port, () => {
    console.log(`Tors Community API running on http://localhost:${port}`);
});
