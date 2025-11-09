require('dotenv').config({ path: '../../.env' }); // adjust relative to cli file
const fs = require("fs");
const path = require("path");
const {Command} = require("commander");
const program= new Command();
const {spawn, execSync}= require("child_process");
//const { execSync } = require("child_process");
const PID_FILE = path.join(process.cwd(), ".pids", "workers.json");

const connectDb= require("../config/dbConnection");
const { setConfig, getConfig, loadConfig, CONFIG_FILE } = require("../configuration/appConfig");

const { enqueueJob, retryDeadJob, getStatusSummary, jobBystate } = require("../services/jobServices");
const backgroundWorker = require("../workers/worker");

connectDb();

//CLI name and version

program
    .name("queuectl")
    .description("CLI background job queue system")
    .version("1.0.0")


// to enqueue a job
program
    .command("enqueue")
    .argument("[jobInput...]", "Job object as JSON string")
    .description("enqueue a new job with json string")
    .action(async (jobInput)=>{
        try{
            // Join all arguments back together (for fixing windows powershell 'multiple arguments' error)
            const jobData = jobInput.join(' ');
            
            if (!jobData) {
                console.log("Please provide job data");
                process.exit(1);
            }

            const parsedData = JSON.parse(jobData);

            // if input from cli missing
            if(!parsedData.id || !parsedData.command){
                console.log("JSON must include both id and command");
                process.exit(1);
            }

            // to catch duplicate ids
            try {
                await enqueueJob(parsedData);
                console.log("Job enqueued successfully!", parsedData.id, parsedData.command);
                process.exit(0);
            } catch (err) {
                if (err.code === 11000) { // mongodb error code for duplicate keys
                    console.log(`Job with id '${parsedData.id}' already exists!`);
                } else {
                    console.log("Error enqueueing job:", err.message);
                }
                process.exit(1);
            }
        }
        catch(err){
            console.log("Invalid JSON or file not found");
            console.log(err.message);
            process.exit(1);
        }
    });

// to start worker
program
    .command("worker:start")
    .description("Start 1 or multiple workers")
    .option("--count <number>", "Number of workers to start", "1")
    .action((options)=>{

        const count= parseInt(options.count, 10);
        console.log(`Starting ${count} worker(s)......`);

        //load existing pids
        let workerPIDs = [];
        if (fs.existsSync(PID_FILE)) {
            workerPIDs = JSON.parse(fs.readFileSync(PID_FILE));
        }

        for (let i = 0; i < count; i++) {
            const workerProcess = spawn("node", ["src/index.js"], {
            stdio: "inherit",
            shell: true,
            });

        console.log(`Worker #${i + 1} started (PID: ${workerProcess.pid})`);
        
        //store pids in the array
        workerPIDs.push(workerProcess.pid);
        }

        fs.writeFileSync(PID_FILE, JSON.stringify(workerPIDs, null, 2));
        console.log("\n PIDs saved to .pids/workers.json\n");
    });

// stop the worker
program
    .command("worker:stop")
    .description("Stop all workers gracefully")
    .action(()=>{
        if (!fs.existsSync(PID_FILE)) {
            console.log(" No PID file found. No workers to stop.");
            return;
        }

        const workerPIDs = JSON.parse(fs.readFileSync(PID_FILE));

        if(workerPIDs.length === 0) {
            console.log(" No active workers running.");
            return;
        }

        console.log(`\n Stopping ${workerPIDs.length} worker(s)...\n`);

        workerPIDs.forEach((pid) => {
        try {
            process.kill(pid, "SIGTERM");
            console.log(` Worker (PID: ${pid}) stopped gracefully.....`);
        } catch (err) {
            console.log(` Could not stop PID ${pid} (maybe already stopped).`);
        }
    });
    // clear the file
    fs.writeFileSync(PID_FILE, JSON.stringify([], null, 2));
    console.log("\n All workers stopped and PID file cleared.\n");
    })

// summary of status + summary of active workers
program
    .command("status")
    .description("Show job status summary")
    .action(async ()=>{
        // 1. Job summary
        const summary= await getStatusSummary();
        console.log("\n Job status summary: ");
        console.table(summary);// .table use kiya instead of log

        // 2. active worker summary
        console.log("\n Worker Status: ");

        let workerPIDs = [];
        if(fs.existsSync(PID_FILE)){
            workerPIDs = JSON.parse(fs.readFileSync(PID_FILE));
        }

        if(workerPIDs.length === 0){
            console.log(" No active workers.");
            return;
        }

        const workerInfo = workerPIDs.map(pid => {
            let alive = false;

            try {
                // check if process exists
                process.kill(pid, 0);
                alive = true;
            } catch (e) {
                alive = false;
            }

            return {
                pid,
                status: alive ? "RUNNING" : "STOPPED"
            };
        });

    console.table(workerInfo);
    });

// view dlq jobs + Listing all jobs ------------> Bonus feature
program 
    .command("list")
    .option("--state <state>","Filter by job state")
    .option("--output", "To show job outputs(stdout or stderr)")
    .description("Get list of jobs")
    .action(async (options)=>{
        const jobs= await jobBystate(options.state);
        console.log('\n Jobs (${options.state || "all"}):');
        // when using --output
        if(options.output){
            console.table(
                jobs.map(j=>({
                    id: j.id !== null && j.id !== undefined ? j.id.toString() : null,
                    command: j.command,
                    state: j.state,
                    attempts: j.attempts,
                    next_run: j.next_run,
                    stdout: j.stdout ? j.stdout.substring(0, 50) + '...' : null,
                    stderr: j.stderr ? j.stderr.substring(0, 50) + '...' : null
                }))
            );
        }
        else{
            console.table(
                jobs.map(j=>({
                    id: j.id !==null && j.id!== undefined ? j.id.toString() : null,
                    command: j.command,
                    state: j.state,
                    attempts: j.attempts,
                    next_run: j.next_run,
                    last_error: j.last_error
                }))
            );
        }
    });

// full job description

program
    .command("job:details")
    .argument("<jobId>", "Job ID to view")
    .description("View detailed job information including full output")
    .action(async (jobId) => {
        const Job = require("../models/job");
        const job = await Job.findOne({ id: jobId });
        
        if (!job) {
            console.log(`Job '${jobId}' not found`);
            process.exit(1);
        }
        
        console.log("\n------- Job Details --------");
        console.log("ID:", job.id);
        console.log("Command:", job.command);
        console.log("State:", job.state);
        console.log("Attempts:", job.attempts);
        console.log("Max Retries:", job.max_retries);
        console.log("Next Run:", job.next_run);
        console.log("Created:", job.createdAt);
        console.log("Updated:", job.updatedAt);
        
        if (job.last_error) {
            console.log("\n--- Last Error ---");
            console.log(job.last_error);
        }
        
        if (job.stdout) {
            console.log("\n--- Standard Output ---");
            console.log(job.stdout);
        }
        
        if (job.stderr) {
            console.log("\n--- Standard Error ---");
            console.log(job.stderr);
        }
        
        process.exit(0);
    });

// retrying dead jobs
program
    .command("dlq:retry")
    .argument("<jobId>", "Job ID from Dead Letter Queue")
    .description("Retry a dead job")
    .action(async(jobId)=>{
        await retryDeadJob(jobId);
        console.log("Job enqueued again as pending", jobId);
    });

//configurations
program
    .command("config:set")
    .argument("<key>", "Config key (backoff_base|default_max_retries)")
    .argument("<value>", "Value")
    .description("Set the configurations stored in .config/config.json file")
    .action(async(key, value)=>{
        try{
            const allowed = ["backoff_base", "default_max_retries"];
            if (!allowed.includes(key)) {
                console.error("Allowed keys:", allowed.join(", "));
                process.exit(1);
            }
            const file = setConfig(key, value);
            console.log("Config updated:", key, "=", file[key]);
        }catch (err){
            console.error("Failed to set config:", err.message);
            process.exit(1);
        }
    });
// config get <key>
program
  .command("config:get")
  .argument("[key]", "Config key (optional). If omitted shows all.")
  .description("Get configuration value")
  .action((key) => {
        const cfg = loadConfig();
        if(key){
            console.log(key, "=", cfg[key]);
        }else{
            console.log("Effective config:");
            console.table(cfg);
            console.log(`(stored file: ${CONFIG_FILE})`);
        }
  });

// alias: config show
program
  .command("config:show")
  .description("Show effective configuration")
  .action(() => {
        const cfg = loadConfig();
        console.log("Effective config:");
        console.table(cfg);
        console.log(`(stored file: ${CONFIG_FILE})`);
  });

//parsing cli input
program.parse(process.argv);