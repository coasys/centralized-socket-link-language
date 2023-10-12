const { Sequelize, DataTypes } = require("sequelize");

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './database.sqlite'
});

const Diff = sequelize.define('Diff', {
    LinkID: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    LinkLanguageUUID: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    Diff: {
        type: DataTypes.JSON,
        allowNull: false,
    },
    DID: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    ServerRecordTimestamp: {
        type: DataTypes.DATE,
        allowNull: false,
    }
});

const AgentStatus = sequelize.define('AgentStatus', {
    DID: {
        type: DataTypes.STRING(255),
        primaryKey: true,
        allowNull: false,
    },
    LinkLanguageUUID: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    Link: {
        type: DataTypes.JSON,
        allowNull: true, // Adjust as needed
    },
    StatusTimestamp: {
        type: DataTypes.DATE,
        allowNull: false,
    },
});

const ActiveAgent = sequelize.define('ActiveAgent', {
    LinkID: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    DID: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    LinkLanguageUUID: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
});

const AgentSyncState = sequelize.define('AgentSyncState', {
    ID: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    DID: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    LinkLanguageUUID: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    Timestamp: {
        type: DataTypes.DATE,
        allowNull: false,
    },
});

async function initDatabase() {
    await Diff.sync();
    await AgentStatus.sync();
    await ActiveAgent.sync();
    await AgentSyncState.sync();
}

module.exports = {
    sequelize,
    initDatabase,
    Diff,
    AgentStatus,
    ActiveAgent,
    AgentSyncState,
}