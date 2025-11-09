const mongoose= require("mongoose");

const jobSchema= mongoose.Schema({
    id:{
        type: String,
        required: true,
        unique: true
    },
    command: {
        type: String,
        required: true
    },
    state: {
        type: String,
        enum: ["pending", "processing", "completed", "failed", "dead"],
        default: "pending"
    },
    attempts: {
        type: Number,
        default: 0
    },
    max_retries: {
        type: Number,
        default: 3
    },
    next_run: { // when the job is available for a re run then
        type: Date,
        default: ()=> new Date(0)
    },
    last_error: {
        type: String,
        default: null
    },
    stdout: { 
        type: String, default: null 
    },
    stderr: { 
        type: String, default: null 
    }
}, {timestamps: true});

module.exports= mongoose.model("Job", jobSchema);