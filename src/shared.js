const os = require('os');

// Identification unique de cette instance
const INSTANCE_NAME = process.env.INSTANCE_NAME || `NyrexV2_${os.hostname()}_${process.pid}`;

// État mémoire global
const activePings = new Map(); // TargetID -> Map<"watcherId:channelId", { watcherId, channelId }>
const ticketPendingForms = new Map(); // userId -> form session details
let isLeader = false;

module.exports = {
    INSTANCE_NAME,
    activePings,
    ticketPendingForms,
    getIsLeader: () => isLeader,
    setIsLeader: (val) => { isLeader = val; }
};
