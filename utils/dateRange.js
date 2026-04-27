// Local-timezone date helpers.
// `new Date().toISOString().split('T')[0]` returns the UTC date — for users in
// UTC+8/UTC-5/etc, this disagrees with "today" near midnight. Use these helpers
// to produce YYYY-MM-DD strings that match what the user calls "today".

function formatLocal(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function todayLocal() {
    return formatLocal(new Date());
}

function localDateNDaysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return formatLocal(d);
}

module.exports = { formatLocal, todayLocal, localDateNDaysAgo };
