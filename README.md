# QUEUECTL – Background Job Queue & Worker System (CLI Based)  
**Author:** Kuldeep Saharan   

QUEUECTL is a lightweight job queue system built with **Node.js** and **MongoDB**, featuring persistent jobs, multiple workers, graceful shutdown, retry handling, exponential backoff, Dead Letter Queue (DLQ) replays, and a configurable runtime — all accessible through a CLI tool.  

# Working CLI DEMO VIDEO LINK
### Link: [QUEUECTL STRUCTURE AND COMMANDS DEMO HERE](https://drive.google.com/file/d/128nR1AzKS428mA9b3SMWPnS7S9WiyEeN/view?usp=sharing)

# Quick links

- Project root commands shown assume you run them from the project root (QUEUECTL).
- Worker process file: src/workers/worker.js
- CLI entrypoint: src/cli/queuectl.js
- Job model: src/models/job.js
- Config store: .config/config.json (CLI editable) and .env (defaults)

  # Project Structure
  - QUEUECTL   
      │   
      ├── .config   
      │   └── config.json   
      ├── .pids   
      │   └── workers.json   
      ├── node_modules   
      ├── src   
      │   ├── cli   
      │   │   └── queuectl.js   
      │   ├── config   
      │   │   └── dbConnection.js   
      │   ├── configuration   
      │   │   └── appConfig.js   
      │   ├── models   
      │   │   └── job.js   
      │   ├── services   
      │   │   └── jobServices.js   
      │   └── workers   
      │       └── worker.js   
      │   └── index.js   
      ├── .env   
      ├── dropDb.js   
      ├── package-lock.json   
      └── package.json   

# Read for your convenience
- Check the values of **"default_max_retries"** and **"backoff_base"** before running commands. (If values are too high, it will take a lot of time in testing; it is suggested to use 3 and 2, respectively)
- for checking type **command: node src/cli/queuectl.js config:get** (from project root that is QUEUECTL)
- If you are getting an error enqueuing jobs with the same ID (example id: job1), consider clearing the database first by **command: node dropDb.js**
  
# 1. Setup — run locally
## Prerequisites

- Node.js (v16+ recommended)
- npm
- MongoDB instance (Atlas connection string)
  [MY CONNECTION STRING IS AVAILABLE IN .ENV FILE., IF THAT DOESN'T WORK, IN ANY CASE, USE PERSONAL CONNECTION STRING OF MONGODB ATLAS]

## Files you should create/verify

- .env (project root) — below is my connection string

- DB_URL=mongodb+srv://admin:admin@kuldeepcluster.5zaybhb.mongodb.net/?appName=KuldeepCluster  
  BACKOFF_BASE=2  
  DEFAULT_MAX_RETRIES=3

- .config/config.json is created automatically by the CLI when needed.
## Clone the repository
git clone https://github.com/MeDeep13/queuectl.git  
## move into project directory
cd queuectl

## Install & start
- #from project root  
  npm install

Run commands with Node (examples below). For development you may run workers or CLI commands directly.


# 2. Usage Examples (CLI)

Note about Windows PowerShell vs cmd vs bash quoting: passing JSON/strings with spaces may need different quoting. For PowerShell prefer single quotes around JSON: '{ "id": "job1", "command": "echo hi" }' or better: pass a file path.

## Enqueue
- <pre>```bash 
  node src/cli/queuectl.js enqueue '{\"id\":\"job111\",\"command\":\"echo Hello World\"}'
  ```</pre>
  
## Start workers

- Start 1 worker  
  node src/cli/queuectl.js worker:start

- Start 3 workers (spawns 3 processes and writes PIDs to .pids/workers.json):  
  node src/cli/queuectl.js worker:start --count 3

## Stop workers (gracefullu)
node src/cli/queuectl.js worker:stop

## Status summary/ check summary
node src/cli/queuectl.js status

## List Jobs
- ### List all jobs
  node src/cli/queuectl.js list

- ### Filter by state
  node src/cli/queuectl.js list --state dead

- ### Show job output
  node src/cli/queuectl.js list --output

## View job details
node src/cli/queuectl.js job:details job1

## Retry dead jobs
node src/cli/queuectl.js dlq:retry job3

## Configuration management

- ## Set configuration:
  node src/cli/queuectl.js config:set backoff_base 3  
  node src/cli/queuectl.js config:set default_max_retries 5

- ## Get configuration
  node src/cli/queuectl.js config:get backoff_base

- ## View all configurations
  node src/cli/queuectl.js config:show

# 3. Architecture overview
## Job schema (core fields)

- id: string — custom unique job identifier (user-provided)
- command: the shell command to execute (string)

- state: pending|processing|completed|failed|dead

- attempts: number of attempts made

- max_retries: allowed retry count

- next_run: Date when job becomes eligible

- last_error: last failure message

- createdAt / updatedAt (timestamps from Mongoose)

## Job lifecycle

- Enqueue — job created in DB with state: pending and next_run default (now).

- Pick — worker queries findOneAndUpdate({ state: 'pending', next_run: { $lte: now }}, { state: 'processing' }) to lock a job atomically.

- Execute — worker uses child_process.exec() to run the command. Exit result determines success or failure.

- On success — mark job completed.

- On failure — increment attempts. If attempts < max_retries schedule next_run = now + backoff_base^attempts seconds and set state: pending; else move job to state: dead (DLQ).

- Graceful shutdown — worker listens for SIGTERM, stops polling (sets running=false) and exits after finishing a currently running job.

## Persistence & locking

MongoDB (Mongoose) stores jobs persistently. findOneAndUpdate is used to atomically claim a job so multiple workers won't process the same job.

## Configuration flow

Defaults come from .env (no hardcoded numbers in code). CLI config:set writes overrides into .config/config.json. loadConfig() reads .config/config.json first, then .env if key missing.

# 4. Assumptions & trade-offs

- Custom id (string) used: user-provided friendly IDs are used. Internally we query by id field (not Mongo _id). This keeps CLI/reading simple but requires id       uniqueness.

- Persistence choice: MongoDB (Atlas) was picked for convenience and robustness. Simpler solutions (JSON file) would be easier to run offline but are slower and     more prone to corruption.

- Command execution: exec() is used (not spawn) for simplicity. exec() buffers stdout/stderr; very long outputs might need spawn().

- Backoff math: next_run uses Math.pow(backoff_base, attempts) seconds. This meets the spec; base is configurable.

- Worker model: Workers are OS processes spawned by the CLI (spawn('node', ['src/index.js'])). PIDs are stored to allow worker:stop.

- No web server: Dashboard is optional — not implemented here by default. Could be added as a bonus.

## 5. Testing instructions (core flows)

### Prerequisites
- Ensure MongoDB is running  
- Stop any existing workers: node src/cli/queuectl.js worker:stop  

Use two terminals when testing: one to run workers, another for CLI commands.

### A. Basic job completes

Enqueue a job and start a worker:

<pre>```bash node src/cli/queuectl.js enqueue '{\"id\":\"job112\",\"command\":\"echo Hello World\"}'```</pre>
node src/cli/queuectl.js worker:start

Observe worker logs: job should run and get completed. Check DB or queuectl list --state completed.

### B. Failed job retries and DLQ

Create with an invalid command with an invalid command:  
- <pre>```bash node src/cli/queuectl.js enqueue '{\"id\":\"fail1\",\"command\":\"thisIsInvalid Hello World\"}'```</pre>

Enqueue and watch worker attempts: it should retry with exponential backoff, then move to dead after retries are exhausted.
Verify with: queuectl list --state dead and queuectl dlq:retry fail1 to requeue.

### C. Multiple workers, no overlap

Enqueue several commands (platform-appropriate). Use unique IDs.
Start multiple workers: queuectl worker:start --count 3.
Confirm each job is processed once (check DB processing/completed states and worker logs).

### D. Invalid commands fail gracefully

Enqueue a job with command: "invalidcmd". Worker should capture error, increment attempts, and schedule retry or move to DLQ.

### E. Persistence across restart

Start worker, enqueue a job, stop workers (worker:stop), restart workers and verify pending job gets processed — jobs survive DB restart or app restart.

### F. Clear database
If there is already data or you want to start over, you can clean the database, I have dropDb.js for that  
To clear DB (dev): use node dropDb.js (ensure .env DB URL points to a dev DB). Be careful — this deletes data.

### Extra developer tips

Windows note: sleep is not a Windows builtin. Use timeout /T 2 or ping -n 3 127.0.0.1 > nul as a sleep substitute when testing on Windows.




