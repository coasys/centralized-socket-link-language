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

const AgentStatus = sequelize.define('AgentStatus', {
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
    Status: {
        type: DataTypes.JSON,
        allowNull: true, // Adjust as needed
    }
})

async function initDatabase() {
    await Diff.sync();
    await AgentSyncState.sync();
    await AgentStatus.sync();
}

module.exports = {
    sequelize,
    initDatabase,
    Diff,
    AgentSyncState,
    AgentStatus,
}