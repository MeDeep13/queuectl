require("dotenv").config();
const connectDb= require("../config/dbConnection");
const Job= require("../models/job");

const { loadConfig } = require("../configuration/appConfig");
const cfg = loadConfig();
const BACKOFF_BASE = cfg.backoff_base ?? 2; // default 2 seconds if not set

let isRunning= true; // this part is for worker:stop

process.on("SIGTERM", ()=>{
    console.log("Worker received SIGTERM, shutting down gracefully...");
    isRunning=false;
})

async function backgroundWorker(){
    await connectDb();

    console.log("Worker has started!");

    const interval= setInterval( async ()=>{
        if(!isRunning){
            clearInterval(interval);
            console.log("worker has stopped");
            process.exit(0);
        }
        const job= await Job.findOneAndUpdate(
            {state: "pending", next_run: {$lte: new Date()}},
            {state: "processing"},
            {new: true}
        );

        if(!job) return;
        console.log("Running job: ", job.id, " with command: ", job.command);

        try{
            const {exec}= require("child_process"); // exec function of child_process

            exec(job.command, async(err, stdout, stderr)=>{ // runing job.command in the os terminal
                if(err){
                    console.log("The following job id failed: ", job.id, " Reason: ", err.message);
                    const attempts = job.attempts +1;
                    const shouldRetry= attempts < job.max_retries;

                    await Job.findOneAndUpdate({id: job.id}, {
                        state: shouldRetry? "pending" : "dead",
                        attempts,
                        last_error: err.message,
                        stdout: stdout || null,
                        stderr: stderr || err.message,
                        next_run: shouldRetry? new Date(Date.now() + Math.pow(BACKOFF_BASE, attempts)*1000) : null
                    });

                }else{
                    console.log("Job with id: ", job.id, " completed!");
                    await Job.findOneAndUpdate({id: job.id}, {
                        state: "completed",
                        stdout: stdout || null,
                        stderr: stderr || null
                    });
                }
            });
        }catch(err){ // for error in worker code (not the job)
            console.log("The following error occured: ", err.message);
        }
    }, 2000)
}

module.exports= backgroundWorker;