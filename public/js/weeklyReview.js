// Weekly Review - stats and chart
(function () {
    const completedEl = document.getElementById('weeklyCompleted');
    const createdEl = document.getElementById('weeklyCreated');
    const streakEl = document.getElementById('weeklyStreak');
    const focusTimeEl = document.getElementById('weeklyFocusTime');
    const chartEl = document.getElementById('weeklyChart');

    if (!completedEl) return;

    async function loadWeeklyStats() {
        try {
            const [statsRes, streakRes, focusRes] = await Promise.all([
                fetch('/stats/weekly'),
                fetch('/stats/streak'),
                fetch('/focus/weekly'),
            ]);

            if (statsRes.ok) {
                const stats = await statsRes.json();
                completedEl.textContent = stats.completed || 0;
                createdEl.textContent = stats.created || 0;
                renderChart(stats.daily || []);
            }

            if (streakRes.ok) {
                const streak = await streakRes.json();
                streakEl.textContent = streak.days || 0;
            }

            if (focusRes.ok) {
                const focus = await focusRes.json();
                const totalMins = Math.round((focus.totalTime || 0) / 60);
                focusTimeEl.textContent = totalMins >= 60
                    ? `${Math.floor(totalMins / 60)}h ${totalMins % 60}m`
                    : `${totalMins}m`;
            }
        } catch (e) {
            console.error('Weekly stats error:', e);
        }
    }

    function renderChart(daily) {
        if (!chartEl) return;

        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const today = new Date().getDay();

        // Build last 7 days data
        const chartData = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dayStr = formatLocalDate(d);
            const entry = daily.find(e => e.date === dayStr);
            chartData.push({
                label: days[d.getDay()],
                count: entry ? entry.completed : 0,
                isToday: i === 0,
            });
        }

        const maxCount = Math.max(1, ...chartData.map(d => d.count));

        chartEl.innerHTML = chartData.map(d => `
            <div class="weekly-chart-bar">
                <span class="bar-count">${d.count || ''}</span>
                <div class="bar ${d.isToday ? 'today' : ''}" style="height: ${Math.max(4, (d.count / maxCount) * 80)}px"></div>
                <span class="bar-label">${d.label}</span>
            </div>
        `).join('');
    }

    window.loadWeeklyReview = loadWeeklyStats;
})();
