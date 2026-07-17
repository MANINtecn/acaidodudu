document.addEventListener('DOMContentLoaded', function() {
    // Input elements
    const inputs = {
        orderVolume: document.getElementById('orderVolume'),
        avgTicket: document.getElementById('avgTicket'),
        laborCost: document.getElementById('laborCost'),
        upsellRate: document.getElementById('upsellRate')
    };

    // Value displays
    const displays = {
        orderVolume: document.getElementById('orderVolumeVal'),
        avgTicket: document.getElementById('avgTicketVal'),
        laborCost: document.getElementById('laborCostVal'),
        upsellRate: document.getElementById('upsellRateVal')
    };

    // Summary displays
    const results = {
        annualProfit: document.getElementById('annualProfit'),
        roiPercentage: document.getElementById('roiPercentage'),
        paybackTime: document.getElementById('paybackTime')
    };

    // Constants for pricing (can be made dynamic later)
    const setupFee = 2000;
    const monthlyFee = 450;

    let chart;

    function formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    }

    function initChart() {
        const ctx = document.getElementById('roiChart').getContext('2d');
        chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Mês 1', 'Mês 2', 'Mês 3', 'Mês 4', 'Mês 5', 'Mês 6', 'Mês 7', 'Mês 8', 'Mês 9', 'Mês 10', 'Mês 11', 'Mês 12'],
                datasets: [{
                    label: 'Lucro Acumulado (R$)',
                    borderColor: '#00f2fe',
                    backgroundColor: 'rgba(0, 242, 254, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    data: []
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: false,
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { color: '#a0a0b8' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#a0a0b8' }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }

    function updateDashboard() {
        // Get values
        const volume = parseFloat(inputs.orderVolume.value);
        const ticket = parseFloat(inputs.avgTicket.value);
        const labor = parseFloat(inputs.laborCost.value);
        const upsell = parseFloat(inputs.upsellRate.value) / 100;

        // Update value displays
        displays.orderVolume.textContent = volume;
        displays.avgTicket.textContent = ticket;
        displays.laborCost.textContent = labor;
        displays.upsellRate.textContent = inputs.upsellRate.value + '%';

        // ROI Math
        // Savings: Labors saved (assuming IA eliminates 80% of manual effort/cost)
        const savingsLabor = labor * 0.8;
        
        // Upsell: Extra sales from IA suggestions
        const extraSales = volume * ticket * upsell;
        
        // Total monthly gain
        const monthlyGain = (savingsLabor + extraSales) - monthlyFee;
        const netProfitAnual = (monthlyGain * 12) - setupFee;

        // Payback calculation
        const payback = setupFee / monthlyGain;
        const totalInvestedYear = setupFee + (monthlyFee * 12);
        const roi = (netProfitAnual / totalInvestedYear) * 100;

        // Display results
        results.annualProfit.textContent = formatCurrency(netProfitAnual);
        results.roiPercentage.textContent = Math.round(roi);
        results.paybackTime.textContent = payback > 0 ? payback.toFixed(1) : 'Imediato';

        // Update Chart Data
        const chartData = [];
        let accumulated = -setupFee;
        for (let i = 1; i <= 12; i++) {
            accumulated += monthlyGain;
            chartData.push(accumulated.toFixed(2));
        }
        
        chart.data.datasets[0].data = chartData;
        chart.update();
    }

    // Event listeners
    Object.keys(inputs).forEach(key => {
        inputs[key].addEventListener('input', updateDashboard);
    });

    initChart();
    updateDashboard();
});
