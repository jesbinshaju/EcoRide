export const calculateFairShare = (totalDist, mileage, fuelPrice, passengers) => {
    // 1. Basic Validation
    if (!passengers || passengers.length === 0) return {};
    
    const costPerKm = fuelPrice / mileage;
    
    // 2. Identify all unique "Change Points" (Stops)
    let points = new Set([0, totalDist]);
    passengers.forEach(p => {
        points.add(p.startKm);
        points.add(p.endKm);
    });
    
    // Sort points: [0, 20, 50, 100]
    const sortedPoints = Array.from(points).sort((a, b) => a - b);
    
    // Initialize costs object
    let finalCosts = {};
    passengers.forEach(p => finalCosts[p.id] = 0);

    // 3. Iterate through every route segment
    for (let i = 0; i < sortedPoints.length - 1; i++) {
        const segStart = sortedPoints[i];
        const segEnd = sortedPoints[i+1];
        const segDistance = segEnd - segStart;
        const segmentCost = segDistance * costPerKm;

        // Who is in the car during this segment?
        const activePassengers = passengers.filter(p => 
            p.startKm <= segStart && p.endKm >= segEnd
        );

        const count = activePassengers.length;

        // Split cost among active people
        if (count > 0) {
            const costPerPerson = segmentCost / count;
            activePassengers.forEach(p => {
                finalCosts[p.id] += costPerPerson;
            });
        }
    }

    return finalCosts;
};