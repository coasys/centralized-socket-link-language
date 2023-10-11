const { Sequelize, DataTypes } = require("sequelize");

const sequelize = new Sequelize('sqlite::memory:');

const Link = sequelize.define('Link', {
    LinkID: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    LinkLanguageUUID: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    Hash: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    Link: {
        type: DataTypes.JSON,
        allowNull: false,
    },
    DID: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    LinkTimestamp: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    Removed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
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
    Hash: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
    Timestamp: {
        type: DataTypes.DATE,
        allowNull: false,
    },
}, {
    uniqueKeys: {
        unique_constraint: {
            fields: ['DID', 'LinkLanguageUUID'],
        },
    },
});

async function initDatabase() {
    await Link.sync();
    await AgentStatus.sync();
    await ActiveAgent.sync();
    await AgentSyncState.sync();
}

module.exports = {
    sequelize,
    initDatabase,
    Link,
    AgentStatus,
    ActiveAgent,
    AgentSyncState,
}