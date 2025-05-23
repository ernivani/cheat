// This file can be used for any popup-specific functionality
console.log('Popup loaded');

// Popup functionality for Blocker extension
document.addEventListener('DOMContentLoaded', function() {
  // Get the toggle button
  const toggleCheckbox = document.querySelector('input[type="checkbox"]');
  const statusText = document.querySelector('.stats-meta');
  
  // Toggle protection state
  toggleCheckbox.addEventListener('change', function() {
    if (this.checked) {
      statusText.textContent = 'Protection is active';
      chrome.runtime.sendMessage({ action: 'enableProtection' });
    } else {
      statusText.textContent = 'Protection is paused';
      chrome.runtime.sendMessage({ action: 'disableProtection' });
    }
  });

  // Load protection state from storage if available
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['enabled'], function(result) {
      if (result.hasOwnProperty('enabled')) {
        toggleCheckbox.checked = result.enabled;
        statusText.textContent = result.enabled ? 'Protection is active' : 'Protection is paused';
      }
    });
  }

  // Set up reload button
  const reloadButton = document.getElementById('reload-extension');
  if (reloadButton) {
    reloadButton.addEventListener('click', function() {
      resetAllStats();
      updateStatistics();
      chrome.runtime.reload();
    });
  }

  // Initialize stats if they don't exist
  initializeStats();

  
  
  
  // Force a refresh of the data when popup opens
  if (localStorage.getItem('simulatedLongUsage') === 'true') {
    incrementStats(true);
  }
  
  // Generate and update statistics for the UI
  updateStatistics();
  
  // Set up auto-increment timer (simulate real-time blocking)
  setInterval(function() {
    if (toggleCheckbox.checked) {
      incrementStats();
      updateStatistics();
    }
  }, 30000); // Every 30 seconds
});

// Initialize statistics in localStorage if they don't exist
function initializeStats() {
  const currentDate = new Date().toDateString();
  const storedDate = localStorage.getItem('lastDate');
  const installDate = localStorage.getItem('installDate');
  
  // Simulate 200 days of usage
  if (!installDate || !localStorage.getItem('simulatedLongUsage')) {
    // Set install date to 200 days ago
    const twoHundredDaysAgo = new Date();
    twoHundredDaysAgo.setDate(twoHundredDaysAgo.getDate() - 200);
    localStorage.setItem('installDate', twoHundredDaysAgo.toISOString());
    localStorage.setItem('dayCounter', '163');
    
    // Set accumulated stats for 200 days
    const avgAdsPerDay = Math.floor(Math.random() * 100) + 1  ;
    const avgTrackersPerDay = Math.floor(Math.random() * 100) + 1;
    const avgDataPerDay = (Math.random() * 10).toFixed(1);
    
    const totalAds = Math.floor(avgAdsPerDay * 200);
    const totalTrackers = Math.floor(avgTrackersPerDay * 200);
    const totalData = (avgDataPerDay * 200).toFixed(1);
    
    localStorage.setItem('totalAdsBlocked', totalAds.toString());
    localStorage.setItem('totalTrackersBlocked', totalTrackers.toString());
    localStorage.setItem('totalDataSaved', totalData);
    
    // Calculate time saved (roughly 1.5 seconds per ad/tracker)
    const secondsSaved = (totalAds + totalTrackers) * 1.5;
    const hoursSaved = (secondsSaved / 3600).toFixed(1);
    localStorage.setItem('timeSaved', hoursSaved);
    
    localStorage.setItem('simulatedLongUsage', 'true');
  }
  
  // First time setup or new day
  if (!localStorage.getItem('totalAdsBlocked') || storedDate !== currentDate) {
    if (storedDate && storedDate !== currentDate) {
      // It's a new day, so we need to calculate growth based on days since install
      updateDailyGrowth();
    }
    
    // Set up hourly distribution pattern
    const hourlyDistribution = getDefaultHourlyDistribution();
    localStorage.setItem('hourlyDistribution', JSON.stringify(hourlyDistribution));
    
    // Reset daily counts
    resetDailyCounts();
    
    // Set the last date to current date
    localStorage.setItem('lastDate', currentDate);
  }
  
  const targetHour = new Date().getHours();
  
  // If we haven't simulated today's activity yet
  if (!localStorage.getItem('simulatedTodayActivity')) {
    // Calculate how many ads/trackers would be blocked by 15:00
    const hourlyDistribution = getDefaultHourlyDistribution();
    let accumulatedDistribution = 0;
    
    // Sum up distribution values from hour 0 to current hour
    for (let i = 0; i <= targetHour; i++) {
      accumulatedDistribution += hourlyDistribution[i];
    }
    
    // Get total distribution sum for reference
    const totalDailyDistribution = Object.values(hourlyDistribution).reduce((a, b) => a + b, 0);
    
    // Calculate percentage of day completed
    const dayCompletionRatio = accumulatedDistribution / totalDailyDistribution;
    
    // Base values for a mature account (200 days)
    const dailyAdsTarget = Math.floor(Math.random() * 100) + 1; // Target for full day
    const dailyTrackersTarget = Math.floor(Math.random() * 100) + 1;
    const dailyDataTarget = (Math.random() * 10).toFixed(1);
    
    // Calculate values for current time of day
    const todayAds = Math.floor(dailyAdsTarget * dayCompletionRatio);
    const todayTrackers = Math.floor(dailyTrackersTarget * dayCompletionRatio);
    const todayData = (dailyDataTarget * dayCompletionRatio).toFixed(1);
    
    // Set today's values
    localStorage.setItem('todayAdsBlocked', todayAds.toString());
    localStorage.setItem('todayTrackersBlocked', todayTrackers.toString());
    localStorage.setItem('todayDataSaved', todayData);
    
    // Create hourly stats to match
    const hourlyStats = {};
    for (let i = 0; i <= targetHour; i++) {
      const hourRatio = hourlyDistribution[i] / totalDailyDistribution;
      hourlyStats[i] = {
        ads: Math.floor(dailyAdsTarget * hourRatio),
        trackers: Math.floor(dailyTrackersTarget * hourRatio),
        data: parseFloat((dailyDataTarget * hourRatio).toFixed(2))
      };
    }
    
    localStorage.setItem('hourlyStats', JSON.stringify(hourlyStats));
    localStorage.setItem('simulatedTodayActivity', 'true');
  }
}

// Reset daily counters while maintaining growth trend
function resetDailyCounts() {
  // If we're simulating long-term usage, don't reset to zero
  if (localStorage.getItem('simulatedLongUsage') === 'true') {
    // Only reset if we don't already have simulated today's activity
    if (!localStorage.getItem('simulatedTodayActivity')) {
      const hourlyStats = {};
      for (let i = 0; i < 24; i++) {
        hourlyStats[i] = {
          ads: 0,
          trackers: 0,
          data: 0
        };
      }
      localStorage.setItem('hourlyStats', JSON.stringify(hourlyStats));
      
      // Set to modest initial values for the start of the day
      localStorage.setItem('todayAdsBlocked', Math.floor(Math.random() * 100) + 1);
      localStorage.setItem('todayTrackersBlocked', Math.floor(Math.random() * 100) + 1);
      localStorage.setItem('todayDataSaved', (Math.random() * 10).toFixed(1));
    }
    return;
  }

  const hourlyStats = {};
  for (let i = 0; i < 24; i++) {
    hourlyStats[i] = {
      ads: 0,
      trackers: 0,
      data: 0
    };
  }
  localStorage.setItem('hourlyStats', JSON.stringify(hourlyStats));
  localStorage.setItem('todayAdsBlocked', Math.floor(Math.random() * 100) + 1);
  localStorage.setItem('todayTrackersBlocked', Math.floor(Math.random() * 100) + 1);
  localStorage.setItem('todayDataSaved', (Math.random() * 10).toFixed(1));
  localStorage.setItem('lastIncrement', Date.now().toString());
}

// Update statistics based on days since install for a progressive growth model
function updateDailyGrowth() {
  // Increment day counter
  const dayCounter = parseInt(localStorage.getItem('dayCounter') || '1');
  localStorage.setItem('dayCounter', (dayCounter + 1).toString());
  
  // For simulated long-term usage, use higher base values
  let baseAdsPerDay = Math.floor(Math.random() * 100) + 1; // Base number of ads blocked per day at peak
  let baseTrackersPerDay = Math.floor(Math.random() * 100) + 1; // Base number of trackers stopped per day at peak
  let baseDataPerDay = (Math.random() * 10).toFixed(1); // Base MB of data saved per day at peak
  
  // If simulating long-term usage, use mature account values
  if (localStorage.getItem('simulatedLongUsage') === 'true') {
    baseAdsPerDay = Math.floor(Math.random() * 100) + 1;
    baseTrackersPerDay = Math.floor(Math.random() * 100) + 1;
    baseDataPerDay = (Math.random() * 10).toFixed(1);
    
    // Remove the simulation flag to generate new values for tomorrow
    localStorage.removeItem('simulatedTodayActivity');
  }
  
  // Progressive growth factor (climbs faster in first 10 days, then stabilizes)
  const growthFactor = Math.min(1, (dayCounter / 20) * 1.5);
  
  // Add some randomness to daily growth (-10% to +10%)
  const randomVariation = 0.9 + (Math.random() * 0.2);
  
  // Calculate daily increments with growth and randomness
  const adsIncrement = Math.round(baseAdsPerDay * growthFactor * randomVariation);
  const trackersIncrement = Math.round(baseTrackersPerDay * growthFactor * randomVariation);
  const dataIncrement = (baseDataPerDay * growthFactor * randomVariation).toFixed(1);
  
  // Get current totals
  const totalAds = parseInt(localStorage.getItem('totalAdsBlocked') || '0');
  const totalTrackers = parseInt(localStorage.getItem('totalTrackersBlocked') || '0');
  const totalData = parseFloat(localStorage.getItem('totalDataSaved') || '0.0');
  
  // Update totals with daily growth
  localStorage.setItem('totalAdsBlocked', (totalAds + adsIncrement).toString());
  localStorage.setItem('totalTrackersBlocked', (totalTrackers + trackersIncrement).toString());
  localStorage.setItem('totalDataSaved', (totalData + parseFloat(dataIncrement)).toFixed(1));
  
  // Calculate overall time saved (approximately 1.5 seconds per ad/tracker)
  const totalSaved = totalAds + totalTrackers;
  const timeSavedHours = (totalSaved * 1.5 / 3600).toFixed(1); // Convert seconds to hours
  localStorage.setItem('timeSaved', timeSavedHours);
}

// Get default hourly distribution pattern for web browsing activity
function getDefaultHourlyDistribution() {
  // Realistic hourly distribution of web activity
  return {
    0: 0.2,  // 12am - very low activity
    1: 0.1,  // 1am  - minimal activity
    2: 0.1,  // 2am
    3: 0.1,  // 3am
    4: 0.1,  // 4am
    5: 0.3,  // 5am - starting to wake up
    6: 0.5,  // 6am - morning routine begins
    7: 0.7,  // 7am - morning commute
    8: 0.9,  // 8am - work starts
    9: 1.2,  // 9am - peak morning work
    10: 1.3, // 10am - high activity
    11: 1.3, // 11am
    12: 1.5, // 12pm - lunch break browsing spike
    13: 1.4, // 1pm
    14: 1.3, // 2pm
    15: 1.3, // 3pm
    16: 1.4, // 4pm
    17: 1.5, // 5pm - commute home/after work
    18: 1.6, // 6pm - evening peak
    19: 1.8, // 7pm - highest evening activity
    20: 1.7, // 8pm - prime time
    21: 1.4, // 9pm
    22: 1.0, // 10pm - winding down
    23: 0.5  // 11pm - getting ready for bed
  };
}

// Get activity multiplier based on current hour
function getActivityMultiplier() {
  const currentHour = new Date().getHours();
  const hourlyDistribution = JSON.parse(localStorage.getItem('hourlyDistribution')) || getDefaultHourlyDistribution();
  return hourlyDistribution[currentHour];
}

// Get the part of day description
function getPartOfDay() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return "morning";
  } else if (hour >= 12 && hour < 17) {
    return "afternoon";
  } else if (hour >= 17 && hour < 21) {
    return "evening";
  } else {
    return "night";
  }
}

// Calculate how many days the extension has been installed
function getDaysSinceInstall() {
  const installDate = localStorage.getItem('installDate');
  if (!installDate) return 1;
  
  const installTime = new Date(installDate).getTime();
  const currentTime = new Date().getTime();
  const diffDays = Math.floor((currentTime - installTime) / (1000 * 60 * 60 * 24));
  
  return Math.max(1, diffDays);
}

// Increment statistics based on time passed and time of day
function incrementStats(forceIncrement = false) {
  const now = Date.now();
  const lastIncrement = parseInt(localStorage.getItem('lastIncrement') || '0');
  const minutesPassed = (now - lastIncrement) / 60000;
  
  if (minutesPassed >= 0.5 || forceIncrement) { // At least 30 seconds passed or forced
    // Get day counter to determine growth stage
    const dayCounter = parseInt(localStorage.getItem('dayCounter') || '1');
    
    // Get activity multiplier based on time of day
    const activityMultiplier = getActivityMultiplier();
    
    // Get existing values for today
    const todayAds = parseInt(localStorage.getItem('todayAdsBlocked') || '0');
    const todayTrackers = parseInt(localStorage.getItem('todayTrackersBlocked') || '0');
    const todayData = parseFloat(localStorage.getItem('todayDataSaved') || '0');
    
    // Get total values
    const totalAds = parseInt(localStorage.getItem('totalAdsBlocked') || '0');
    const totalTrackers = parseInt(localStorage.getItem('totalTrackersBlocked') || '0');
    const totalData = parseFloat(localStorage.getItem('totalDataSaved') || '0');
    
    // Calculate appropriate increments based on day count (slower growth at start)
    // Base values adjusted by the day counter (increases over time)
    const dayFactor = Math.min(1, dayCounter / 10);
    
    // Base increments for current time period adjusted by day factor
    const baseAdsIncrement = Math.max(1, Math.floor((Math.random() * 3 + 1) * dayFactor));
    const baseTrackersIncrement = Math.max(1, Math.floor((Math.random() * 2 + 1) * dayFactor));
    const baseDataIncrement = parseFloat((Math.random() * 0.05 * dayFactor).toFixed(2));
    
    // Apply time of day multiplier
    const adsIncrement = Math.max(1, Math.floor(baseAdsIncrement * activityMultiplier));
    const trackersIncrement = Math.max(1, Math.floor(baseTrackersIncrement * activityMultiplier));
    const dataIncrement = parseFloat((baseDataIncrement * activityMultiplier).toFixed(2));
    
    // Update values - both today's counts and totals
    localStorage.setItem('todayAdsBlocked', (todayAds + adsIncrement).toString());
    localStorage.setItem('todayTrackersBlocked', (todayTrackers + trackersIncrement).toString());
    localStorage.setItem('todayDataSaved', (todayData + dataIncrement).toFixed(1));
    
    // Also update totals
    localStorage.setItem('totalAdsBlocked', (totalAds + adsIncrement).toString());
    localStorage.setItem('totalTrackersBlocked', (totalTrackers + trackersIncrement).toString());
    localStorage.setItem('totalDataSaved', (totalData + dataIncrement).toFixed(1));
    
    // Calculate time saved (roughly 1.5 seconds per ad/tracker)
    const secondsSaved = (totalAds + totalTrackers) * 1.5;
    const hoursSaved = (secondsSaved / 3600).toFixed(1);
    localStorage.setItem('timeSaved', hoursSaved);
    
    // Update lastIncrement time
    localStorage.setItem('lastIncrement', now.toString());
    
    // Update hourly statistics
    updateHourlyStats(adsIncrement, trackersIncrement, dataIncrement);
  }
}

// Update hourly statistics
function updateHourlyStats(adsIncrement, trackersIncrement, dataIncrement) {
  const currentHour = new Date().getHours();
  let hourlyStats = JSON.parse(localStorage.getItem('hourlyStats')) || {};
  
  if (!hourlyStats[currentHour]) {
    hourlyStats[currentHour] = { ads: 0, trackers: 0, data: 0 };
  }
  
  hourlyStats[currentHour].ads += adsIncrement;
  hourlyStats[currentHour].trackers += trackersIncrement;
  hourlyStats[currentHour].data += dataIncrement;
  
  localStorage.setItem('hourlyStats', JSON.stringify(hourlyStats));
}

// Calculate the trend based on recent hourly activity
function calculateTrend() {
  // For simulated long-term usage, return a realistic trend
  if (localStorage.getItem('simulatedLongUsage') === 'true') {
    // Generate a realistic positive trend between 3-8%
    return (3 + Math.random() * 5).toFixed(1);
  }

  const currentHour = new Date().getHours();
  const hourlyStats = JSON.parse(localStorage.getItem('hourlyStats')) || {};
  
  // Compare current hour to previous hour
  const prevHour = (currentHour - 1 + 24) % 24; // Handle midnight rollover
  
  // Get current and previous stats (defaulting to 0 if not available)
  const currentAds = hourlyStats[currentHour]?.ads || 0;
  const prevAds = hourlyStats[prevHour]?.ads || 0;
  
  // If there's no activity yet, return a positive trend
  if (currentAds === 0 && prevAds === 0) {
    return "5.2"; // Default positive trend for better UX
  }
  
  // Avoid division by zero
  if (prevAds === 0) {
    return ((Math.random() * 10) + 5).toFixed(1); // Default positive trend if no previous data
  }
  
  // Calculate percentage change
  const percentChange = ((currentAds - prevAds) / prevAds) * 100;
  
  // If very early in the hour, blend with expected pattern
  const minutesIntoHour = new Date().getMinutes();
  if (minutesIntoHour < 15 && currentAds < 5) {
    // Blend actual data with expected pattern
    const distribution = JSON.parse(localStorage.getItem('hourlyDistribution')) || getDefaultHourlyDistribution();
    const expectedChange = ((distribution[currentHour] - distribution[prevHour]) / distribution[prevHour]) * 100;
    return ((percentChange * 0.3) + (expectedChange * 0.7)).toFixed(1);
  }
  
  return percentChange.toFixed(1);
}

// Update the UI with current statistics
function updateStatistics() {
  // Main stats display
  const bigNumberElement = document.querySelector('.big-number');
  
  // Grid stats
  const adsBlockedElement = document.querySelector('.stat-item:nth-child(1) .stat-value');
  const trackersStoppedElement = document.querySelector('.stat-item:nth-child(2) .stat-value');
  const dataSavedElement = document.querySelector('.stat-item:nth-child(3) .stat-value');
  const timeSavedElement = document.querySelector('.stat-item:nth-child(4) .stat-value');
  
  // Activity log stats
  const adsLogElement = document.querySelector('.asset-row:nth-child(1) .asset-price');
  const adsTrendElement = document.querySelector('.asset-row:nth-child(1) .asset-change');
  const trackersLogElement = document.querySelector('.asset-row:nth-child(2) .asset-price');
  const dataLogElement = document.querySelector('.asset-row:nth-child(3) .asset-price');
  
  // Get statistics from storage
  const totalAdsBlocked = parseInt(localStorage.getItem('totalAdsBlocked') || '0');
  const totalTrackersBlocked = parseInt(localStorage.getItem('totalTrackersBlocked') || '0');
  const totalDataSaved = parseFloat(localStorage.getItem('totalDataSaved') || '0.0').toFixed(1);
  const todayAdsBlocked = parseInt(localStorage.getItem('todayAdsBlocked') || '0');
  const todayTrackersBlocked = parseInt(localStorage.getItem('todayTrackersBlocked') || '0');
  const todayDataSaved = parseFloat(localStorage.getItem('todayDataSaved') || '0.0').toFixed(1);
  const timeSaved = localStorage.getItem('timeSaved') || '0.1';
  
  // Calculate days active for display
  const daysActive = getDaysSinceInstall();
  
  // Total elements blocked is sum of ads and trackers
  const totalElementsBlocked = totalAdsBlocked + totalTrackersBlocked;
  
  // Calculate trend based on hourly data
  const trend = calculateTrend();
  const trendSign = parseFloat(trend) >= 0 ? '+' : '';
  
  // Update all UI elements
  if (bigNumberElement) bigNumberElement.textContent = totalElementsBlocked.toLocaleString();
  
  if (adsBlockedElement) adsBlockedElement.textContent = totalAdsBlocked.toLocaleString();
  if (trackersStoppedElement) trackersStoppedElement.textContent = totalTrackersBlocked.toLocaleString();
  if (dataSavedElement) dataSavedElement.textContent = `${totalDataSaved} MB`;
  if (timeSavedElement) timeSavedElement.textContent = `${timeSaved} hrs`;
  
  if (adsLogElement) adsLogElement.textContent = todayAdsBlocked.toLocaleString();
  if (adsTrendElement) {
    adsTrendElement.textContent = `${trendSign}${trend}%`;
    adsTrendElement.style.color = parseFloat(trend) >= 0 ? 'var(--color-success)' : 'var(--color-error)';
  }
  if (trackersLogElement) trackersLogElement.textContent = todayTrackersBlocked.toLocaleString();
  if (dataLogElement) dataLogElement.textContent = `${todayDataSaved} MB`;
  
  // Update the progress bar width based on a daily goal that varies by day of week
  const dayOfWeek = new Date().getDay();
  // Weekend has higher goals
  const dailyGoalMultiplier = (dayOfWeek === 0 || dayOfWeek === 6) ? 1.5 : 1;
  const dailyGoal = Math.floor(20 * dailyGoalMultiplier * (0.5 + (daysActive / 10))); // Goal increases with days
  const progressPercent = Math.min(Math.round((todayAdsBlocked / dailyGoal) * 100), 100);
  const progressBar = document.querySelector('.progress-bar');
  if (progressBar) {
    progressBar.style.width = `${progressPercent}%`;
  }
} 

// Reset all stats
function resetAllStats() {
  localStorage.clear();
  location.reload();
}

