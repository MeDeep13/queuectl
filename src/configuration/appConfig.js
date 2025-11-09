const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

// paths for configuration
const CONFIG_DIR = path.join(process.cwd(), ".config");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

// if files or folder don't exist then make
if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR);
if (!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, JSON.stringify({}, null, 2));


// function to read file
function _readFile() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch (e) {
    return {};
  }
}

// function to write to file
function _writeFile(obj) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(obj, null, 2));
}


// loading config function
function loadConfig() {
  const file = _readFile(); // read values saved by cli

  // reading environment variables, but will only be used if not present in json
  const env = {
    backoff_base: process.env.BACKOFF_BASE ? Number(process.env.BACKOFF_BASE) : undefined,
    default_max_retries: process.env.DEFAULT_MAX_RETRIES ? Number(process.env.DEFAULT_MAX_RETRIES) : undefined,
  };

  return {
    // JSON file values take precedence over env, then default fallback
    backoff_base: file.backoff_base ?? env.backoff_base ?? 2,
    default_max_retries: file.default_max_retries ?? env.default_max_retries ?? 3,
    _raw: file 
  };
}


// setting a config value
function setConfig(key, value) {
  const file = _readFile();

  // numeric keys, convert to number
  if (["backoff_base", "default_max_retries", "max_retries"].includes(key)) {
    const n = Number(value);
    if (Number.isNaN(n)) throw new Error("Value must be a number");
    file[key] = n;
  } else {
    file[key] = value;
  }

  _writeFile(file); // saving to json
  return file;
}


// getting a config value (or all if key not given)
function getConfig(key) {
  const cfg = loadConfig(); 
  if (!key) return cfg;
  return cfg[key];
}

module.exports = { loadConfig, setConfig, getConfig, CONFIG_FILE };
