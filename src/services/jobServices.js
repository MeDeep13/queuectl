const Job= require("../models/job");
const { loadConfig } = require("../configuration/appConfig");

// adding a new job
async function enqueueJob(obj){
    const cfg = loadConfig();

    return await Job.create({
        id: obj.id,
        command: obj.command,
        state: "pending",
        attempts: 0,
        max_retries: obj.max_retries ?? cfg.default_max_retries,
        next_run: new Date(0),
        last_error: null,
        stdout: null,
        stderr: null
    });
}

// retrying a dead job

async function retryDeadJob(jobId){
    return await Job.findOneAndUpdate({id: jobId}, {
        state: "pending",
        attempts: 0,
        next_run: new Date(0),
        last_error: null
    });
}

// getting status of summaries
async function getStatusSummary() {
    const states = ["pending", "processing", "completed", "failed", "dead"];
    const summary = {};

    for(let s of states)
        summary[s]= await Job.countDocuments({state: s}); // mongoose function to count number of documents

    return summary;
}

// Listing jobs by state -----------> Bonus feature

async function jobBystate(state) {
    if(state){
        return await Job.find({state}).sort({createdAt: -1});
    }
    return await Job.find().sort({createdAt: -1}); // -1 for descending (newest jobs first)
}

module.exports= {
    enqueueJob,
    retryDeadJob,
    getStatusSummary,
    jobBystate
}