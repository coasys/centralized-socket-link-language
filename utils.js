function hash(data, author, timestamp) {
    console.log(data, author, timestamp)
    const mash = JSON.stringify(data, Object.keys(data).sort()) +
        JSON.stringify(author) + timestamp
    let hash = 0, i, chr;
    for (i = 0; i < mash.length; i++) {
        chr = mash.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
}

module.exports = {
    hash
}