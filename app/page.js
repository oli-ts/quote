"use client";

import React, { useMemo, useState } from "react";

// Save as /app/quote-calculator/page.jsx (Next.js App Router)
export default function Page() {
  const [area, setArea] = useState("");
  const [rooms, setRooms] = useState("1");
  const [location, setLocation] = useState("");
  const [isLondon, setIsLondon] = useState(false);
  const [distanceMiles, setDistanceMiles] = useState("");
  const [travelHoursOneWay, setTravelHoursOneWay] = useState("");
  const [jobType, setJobType] = useState("");
  const [finishType, setFinishType] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [quote, setQuote] = useState(null);
  const [profitPercent, setProfitPercent] = useState(30); // adjustable profit 5–40

  // === Configurable rates (EDIT THESE WHEN YOU FLESH OUT PRICING) ===
  const RATES = useMemo(() => ({
    initialVisitPerPersonPerDay: 350,
    prepPerPersonPerDay: 250,        // Preparation (pouring)
    placementPerPersonPerDay: 400,   // Placement & Power Trowelling
    jointCutPerPersonPerDay: 250,    // Joint cutting & cover
    polishingPerPersonPerDay: 400,   // TODO: confirm
    detailingPerPersonPerDay: 250,   // TODO: confirm
    accommodationPerPersonPerDay: 60,
    travelLabourPerHourPerLeg: 15,
    fuelPerMileFactor: 0.76,
    peoplePerVan: 3,
    daysPerWeek: 5,
    // London charges placeholders (edit when you have real numbers)
    londonParkingPerVanPerDay: 0,
    londonCongestionPerVanPerDay: 0,
  }), []);

  const jobTypeMap = useMemo(
    () => ({
      polishing: "Concrete Polishing",
      "supply-placement-polishing": "Concrete Supply, Placement and Polishing",
    }),
    []
  );

  const finishTypeMap = useMemo(
    () => ({
      "power-trowel-seal": "Power Trowel & Seal",
      "rustic-style": "Rustic Style Finish",
      "variable-finish": "Variable Finish",
      "exposed-aggregate": "Exposed Aggregate Finish",
      hydrated: "Hydrated Finish",
      "overlay-rustic": "Overlay Rustic (coming soon)",
      "overlay-exposed": "Overlay Exposed (coming soon)",
    }),
    []
  );

  function toast(msg) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 2200);
  }

  function ceilDiv(a, b) { return Math.ceil(a / b); }
  function round(n, dp = 2){ return Math.round((n + Number.EPSILON) * 10**dp) / 10**dp; }

  // === Materials Calculation ===
  function calcMaterials(areaM2, finishType) {
    // Standard materials (fixed per m²)
    const standardRates = {
      "Perimeter Isolation Foam": 0.5,
      "Plastic angle trim": 0.25,
      "Plant Hire": 2,
      "Reinforcement fibres": 0.5,
      "Misc Preparation Materials (Glue, Tape, blades, staples, etc)": 2,
      "Joint cutting blades": 0.5,
      "Floor Protection (Antinox + TPS)": 1.5,
    };

    // Variable materials (depend on finish type)
    const colourSurfaceHardener = {
      "exposed-aggregate": 12,
      "variable-finish": 12,
      "rustic-style": 3,
      "power-trowel-seal": 2,
      hydrated: 8,
    };

    const polishingMaterials = {
      "exposed-aggregate": 15,
      "variable-finish": 12,
      "rustic-style": 8,
      "power-trowel-seal": 5,
      hydrated: 12,
    };

    const std = Object.entries(standardRates).map(([name, rate]) => ({
      name,
      rate,
      per: "m²",
      qty: areaM2,
      cost: rate * areaM2,
    }));

    const variable = [
      {
        name: "Colour Surface Hardener",
        rate: colourSurfaceHardener[finishType] || 0,
        per: "m²",
        qty: areaM2,
        cost: (colourSurfaceHardener[finishType] || 0) * areaM2,
      },
      {
        name: "Polishing Materials, Tooling, Sealer & Consumables",
        rate: polishingMaterials[finishType] || 0,
        per: "m²",
        qty: areaM2,
        cost: (polishingMaterials[finishType] || 0) * areaM2,
      },
    ];

    const list = [...std, ...variable];
    const total = list.reduce((sum, m) => sum + m.cost, 0);
    return { list, total };
  }

  function calcQuote() {
    const areaM2 = parseFloat(area);
    const roomCount = parseInt(rooms, 10);
    const dist = parseFloat(distanceMiles) || 0;
    const travelH = parseFloat(travelHoursOneWay) || 0;
    const clampedProfit = Math.min(40, Math.max(5, Number(profitPercent) || 0));
    const profitMargin = clampedProfit / 100;

    // Tolerance-aware 100m² blocks (20m² grace over each threshold)
    function ceilDivWithTolerance(value, blockSize = 100, tolerance = 20) {
      if (value <= blockSize + tolerance) return 1;
      return Math.ceil((value - tolerance) / blockSize);
    }

    const blocks100 = Math.max(1, ceilDivWithTolerance(areaM2, 100, 20));
    const additionalRooms = Math.max(0, roomCount - 1); // first room included

    // ==== Labour structure per stage ====
    // Preparation (pouring)
    const prep = {
      stage: "Preparation",
      contractors: 2,
      days: blocks100 + additionalRooms, // rooms add days beyond the first
      rate: RATES.prepPerPersonPerDay,
    };

    // Placement & Power Trowelling (pouring)
    let placementContractors = 4 + (finishType === "hydrated" ? 2 : 0);
    const placement = {
      stage: "Placement & Power Trowel",
      contractors: placementContractors,
      days: blocks100 + additionalRooms,
      rate: RATES.placementPerPersonPerDay,
    };

    // Joint Cutting & Cover (pouring)
    const joint = {
      stage: "Joint Cutting & Cover",
      contractors: 2,
      days: blocks100 + additionalRooms,
      rate: RATES.jointCutPerPersonPerDay,
    };

    // Polishing (polishing)
    const POLISH_RULES = {
      "power-trowel-seal": { contractors: 0, daysPer100: 0 }, // none
      "rustic-style": { contractors: 2, daysPer100: 3 },
      "variable-finish": { contractors: 3, daysPer100: 4 },
      "exposed-aggregate": { contractors: 3, daysPer100: 5 },
      hydrated: { contractors: 3, daysPer100: 4 },
    };
    const pr = POLISH_RULES[finishType] || { contractors: 0, daysPer100: 0 };
    const polishing = {
      stage: "Polishing",
      contractors: pr.contractors,
      days: pr.daysPer100 * blocks100, // scale linearly by blocks
      rate: RATES.polishingPerPersonPerDay,
    };

    // Detailing (detailing)
    const detailContractors = finishType === "power-trowel-seal" ? 0 : 2;
    const detailDays = finishType === "power-trowel-seal" ? 0 : 1 * blocks100; // linear scaling
    const detailing = {
      stage: "Detailing",
      contractors: detailContractors,
      days: detailDays,
      rate: RATES.detailingPerPersonPerDay,
    };

    const stages = [prep, placement, joint, polishing, detailing].filter(s => s.contractors > 0 && s.days > 0);

    // Initial visit: 1 person 1 day, +1 person per 250m²
    const initialVisitPeople = 1 + Math.floor(Math.max(0, areaM2 - 1) / 250);
    const initialVisitCost = initialVisitPeople * 1 * RATES.initialVisitPerPersonPerDay;

    // Labour cost per stage
    const stageLabour = stages.map(s => ({
      ...s,
      personDays: s.contractors * s.days,
      labourCost: s.contractors * s.days * s.rate,
      weeks: ceilDiv(s.days, RATES.daysPerWeek),
      vans: Math.max(1, Math.ceil(s.contractors / RATES.peoplePerVan)),
    }));

    const labourTotal = stageLabour.reduce((sum, s) => sum + s.labourCost, 0) + initialVisitCost;

    // Accommodation: if travel > 1.5h one-way, £60 pp/day for all person-days
    const totalPersonDays = stageLabour.reduce((sum, s) => sum + s.personDays, 0);
    const needsAccommodation = travelH > 1.5;
    const accommodationCost = needsAccommodation ? totalPersonDays * RATES.accommodationPerPersonPerDay : 0;

    // Fuel per stage: vans * miles * weeks * 0.76
    const fuelCost = stageLabour.reduce((sum, s) => sum + (s.vans * dist * s.weeks * RATES.fuelPerMileFactor), 0);

    // Travel labour
    let travelLabourCost = 0;
    if (!needsAccommodation) {
      // Daily commute: per person per day, both ways, per hour
      stageLabour.forEach(s => {
        const perPersonPerDay = 2 * travelH * RATES.travelLabourPerHourPerLeg;
        travelLabourCost += s.contractors * s.days * perPersonPerDay;
      });
    } else {
      // With accommodation: per person per week (2 legs per week)
      stageLabour.forEach(s => {
        const legsPerWeek = 2; // HQ -> site, site -> HQ
        const perPersonPerWeek = legsPerWeek * travelH * RATES.travelLabourPerHourPerLeg;
        travelLabourCost += s.contractors * s.weeks * perPersonPerWeek;
      });
    }

    // Parking/Congestion (London only) – placeholder
    const londonDays = stageLabour.reduce((sum, s) => sum + s.days, 0);
    const londonVansAvg = stageLabour.length ? Math.round(stageLabour.reduce((sum, s) => sum + s.vans, 0) / stageLabour.length) : 0;
    const parkingCongestionCost = isLondon
      ? (londonDays * londonVansAvg * (RATES.londonParkingPerVanPerDay + RATES.londonCongestionPerVanPerDay))
      : 0;

    // === Materials ===
    const materials = calcMaterials(areaM2, finishType);
    const materialsCost = materials.total;

    const logisticsCost = fuelCost + travelLabourCost + parkingCongestionCost;

    const subtotal = labourTotal + accommodationCost + logisticsCost + materialsCost;

    const actualTotal = subtotal * (1 + profitMargin);

    const addProfit = (n) => n * (1 + profitMargin);
    const withProfit = {
      initialVisitCost: round(addProfit(initialVisitCost)),
      labourTotal: round(addProfit(labourTotal)),
      accommodationCost: round(addProfit(accommodationCost)),
      logistics: {
        fuelCost: round(addProfit(fuelCost)),
        travelLabourCost: round(addProfit(travelLabourCost)),
        parkingCongestionCost: round(addProfit(parkingCongestionCost)),
      },
      materialsCost: round(addProfit(materialsCost)),
      subtotal: round(addProfit(subtotal)),
    };

    return {
      meta: { areaM2, roomCount, blocks100, distanceMiles: dist, travelHoursOneWay: travelH, needsAccommodation, isLondon, jobType, finishType, profitPercent: clampedProfit },
      stages: stageLabour,
      materials,
      costs: {
        initialVisitCost: round(initialVisitCost),
        labourTotal: round(labourTotal),
        accommodationCost: round(accommodationCost),
        logistics: {
          fuelCost: round(fuelCost),
          travelLabourCost: round(travelLabourCost),
          parkingCongestionCost: round(parkingCongestionCost),
        },
        materialsCost: round(materialsCost),
        subtotal: round(subtotal),
        actualTotal: round(actualTotal)
        ,
        withProfit,
      }
    };
  }

  function handleSubmit(e) {
    e.preventDefault();
    const areaN = parseFloat(area);
    const roomsN = parseInt(rooms, 10);
    if (Number.isNaN(areaN) || areaN <= 0) return toast("Enter a valid area in m².");
    if (!Number.isInteger(roomsN) || roomsN <= 0) return toast("Enter a valid room count.");
    if (!location.trim()) return toast("Enter a location.");
    if (!jobType) return toast("Select a job type.");
    if (!finishType) return toast("Select a finish type.");

    const q = calcQuote();
    setQuote(q);
    setSubmitted(true);
  }

  function formatGBP(n) {
    return (Number(n) || 0).toLocaleString("en-GB", { style: "currency", currency: "GBP" });
  }

  async function handleExportPdf() {
    if (!quote) return;
    const { meta, costs } = quote;
    const wp = costs.withProfit || {};
    const pm = (Number(meta.profitPercent) || 0) / 100;
    const addP = (n) => (Number(n) || 0) * (1 + pm);
    const labourRows = (quote.stages || [])
      .map((s) => (
        `<tr>
          <td>${s.stage}</td>
          <td class="right">${s.contractors}</td>
          <td class="right">${s.days}</td>
          <td class="right">${s.personDays}</td>
          <td class="right">${formatGBP(s.labourCost)}</td>
          <td class="right"><strong>${formatGBP(addP(s.labourCost))}</strong></td>
        </tr>`
      ))
      .join("");
    const materialsRows = (quote.materials?.list || [])
      .map((m) => (
        `<tr>
          <td>${m.name}</td>
          <td class="right">${formatGBP(m.rate)} / ${m.per || "unit"}</td>
          <td class="right">${m.qty}</td>
          <td class="right">${formatGBP(m.cost)}</td>
          <td class="right"><strong>${formatGBP(addP(m.cost))}</strong></td>
        </tr>`
      ))
      .join("");
    const logoUrl = `${window.location.origin}/logo.svg`;
    let logoMarkup = `<img src="${logoUrl}" alt="CPG Logo" />`;
    try {
      const res = await fetch(logoUrl, { cache: "no-cache" });
      if (res.ok) {
        const svgText = await res.text();
        if (svgText && svgText.trim().startsWith("<svg")) {
          logoMarkup = svgText; // inline SVG for crisp print
        }
      }
    } catch (_) { /* fallback to <img> */ }
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>CPG Quote</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #111; background: #fff; }
      .wrap { max-width: 880px; margin: 0 auto; text-align: center; }
      h1 { font-size: 22px; margin: 0 0 6px; }
      h2 { font-size: 16px; margin: 0 0 12px; }
      .section { margin: 22px 0; }
      .card { border: 1px solid #ddd; border-radius: 10px; padding: 16px; box-sizing: border-box; }
      table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 8px; border: 1px solid #ddd; border-radius: 10px; overflow: hidden; }
      th, td { padding: 10px 12px; border-bottom: 1px solid #eee; border-right: 1px solid #eee; text-align: center; }
      th { background: #fafafa; font-weight: 600; }
      tr:last-child td { border-bottom: 0; }
      td:last-child, th:last-child { border-right: 0; }
      td:first-child, th:first-child { text-align: left; }
      .right { text-align: right; }
      .muted { color: #666; font-size: 12px; }
      .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
      .brand-left { display: flex; align-items: center; gap: 12px; }
      .brand-right { text-align: right; }
      .brand-left img { height: 52px; width: auto; }
      .brand-left svg { height: 52px; width: auto; }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="header">
        <div class="brand-left">
          ${logoMarkup}
        </div>
        <div class="brand-right">
          <h1>Quote</h1>
          <div class="muted">Generated: ${new Date().toLocaleString()}</div>
        </div>
      </div>
    <div class="section card">
      <h2>Project</h2>
      <table>
      <tr><th>Location</th><td>${meta.location || ""}</td></tr>
      <tr><th>Area</th><td>${meta.areaM2} m²</td></tr>
      <tr><th>Rooms</th><td>${meta.roomCount}</td></tr>
      <tr><th>Finish</th><td>${meta.finishType}</td></tr>
      <tr><th>London?</th><td>${meta.isLondon ? "Yes" : "No"}</td></tr>
      <tr><th>Distance</th><td>${meta.distanceMiles} miles</td></tr>
      <tr><th>Travel (one-way)</th><td>${meta.travelHoursOneWay} h</td></tr>
      <tr><th>Profit</th><td>${meta.profitPercent}%</td></tr>
      </table>
    </div>
    <div class="section card">
      <h2>Labour (incl. Profit)</h2>
      <table>
      <thead>
        <tr>
          <th>Stage</th>
          <th class="right">Contractors</th>
          <th class="right">Days</th>
          <th class="right">Person Days</th>
          <th class="right">Cost excl.</th>
          <th class="right">Cost incl. profit</th>
        </tr>
      </thead>
      <tbody>
        ${labourRows}
      </tbody>
      </table>
    </div>
    <div class="section card">
      <h2>Materials (incl. Profit)</h2>
      <table>
      <thead>
        <tr>
          <th>Item</th>
          <th class="right">Rate</th>
          <th class="right">Qty</th>
          <th class="right">Cost excl.</th>
          <th class="right">Cost incl. profit</th>
        </tr>
      </thead>
      <tbody>
        ${materialsRows}
      </tbody>
      </table>
    </div>
    <div class="section card">
      <h2>Costs (incl. Profit)</h2>
      <table>
      <tr><th>Initial Visit</th><td class="right">${formatGBP(wp.initialVisitCost)}</td></tr>
      <tr><th>Labour Total</th><td class="right">${formatGBP(wp.labourTotal)}</td></tr>
      <tr><th>Accommodation</th><td class="right">${formatGBP(wp.accommodationCost)}</td></tr>
      <tr><th>Fuel</th><td class="right">${formatGBP(wp.logistics?.fuelCost)}</td></tr>
      <tr><th>Travel Labour</th><td class="right">${formatGBP(wp.logistics?.travelLabourCost)}</td></tr>
      <tr><th>Parking/Congestion</th><td class="right">${formatGBP(wp.logistics?.parkingCongestionCost)}</td></tr>
      <tr><th>Materials</th><td class="right">${formatGBP(wp.materialsCost)}</td></tr>
      <tr><th><strong>Total (excl. VAT)</strong></th><td class="right"><strong>${formatGBP(costs.actualTotal)}</strong></td></tr>
      </table>
    </div>
    </div>
    <script>
      (function(){
        function printWhenReady(){
          const imgs = Array.from(document.images);
          const svgs = Array.from(document.querySelectorAll('svg'));
          if (imgs.length === 0 && svgs.length > 0) return window.print();
          let done = 0;
          function step(){ if (++done >= imgs.length) window.print(); }
          imgs.forEach(img => {
            if (img.complete) step();
            else {
              img.addEventListener('load', step, { once: true });
              img.addEventListener('error', step, { once: true });
            }
          });
        }
        window.addEventListener('load', printWhenReady);
      })();
    </script>
  </body>
</html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans flex flex-col">
      {/* Toast */}
      {toastMsg ? (
        <div className="fixed inset-x-0 top-4 mx-auto w-fit max-w-[90%] z-50">
          <div className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-sm shadow">
            {toastMsg}
          </div>
        </div>
      ) : null}

      <header className="w-full py-10 text-center">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold">
          Concrete Polishing Group — Quote Calculator
        </h1>
      </header>

      <main className="w-full px-4 flex justify-center">
        <div className="w-full max-w-3xl">
          <div className="bg-white shadow-sm rounded-2xl p-6 sm:p-8 border border-neutral-200">
            <form onSubmit={handleSubmit} className="grid gap-5" noValidate>
              {/* Profit Margin control */}
              <div className="text-center">
                <label htmlFor="profit" className="block text-sm font-medium mb-2">Profit Margin (%)</label>
                <select
                  id="profit"
                  name="profit"
                  value={profitPercent}
                  onChange={(e) => setProfitPercent(Number(e.target.value))}
                  className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-center shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-800"
                >
                  {[5,10,15,20,25,30,35,40].map((p) => (
                    <option key={p} value={p}>{p}%</option>
                  ))}
                </select>
                <div className="text-xs text-neutral-500 mt-1">Applied to each cost line and the total.</div>
              </div>
              {/* Inputs */}
              <div className="grid sm:grid-cols-2 gap-5">
                <div className="text-center">
                  <label htmlFor="area" className="block text-sm font-medium mb-2">Area (m²)</label>
                  <input id="area" name="area" type="number" inputMode="decimal" min="0" step="0.01" required placeholder="e.g. 120" value={area} onChange={(e) => setArea(e.target.value)} className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-center shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-800" />
                </div>
                <div className="text-center">
                  <label htmlFor="rooms" className="block text-sm font-medium mb-2">Number of Rooms</label>
                  <input id="rooms" name="rooms" type="number" min="1" step="1" required placeholder="e.g. 5" value={rooms} onChange={(e) => setRooms(e.target.value)} className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-center shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-800" />
                </div>
              </div>

              <div className="text-center">
                <label htmlFor="location" className="block text-sm font-medium mb-2">Location</label>
                <input id="location" name="location" type="text" required placeholder="City / Postcode" value={location} onChange={(e) => setLocation(e.target.value)} className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-center shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-800" />
              </div>

              <div className="grid sm:grid-cols-3 gap-5">
                <div className="text-center">
                  <label htmlFor="distance" className="block text-sm font-medium mb-2">Distance to Site (miles)</label>
                  <input id="distance" name="distance" type="number" min="0" step="0.1" placeholder="e.g. 80" value={distanceMiles} onChange={(e) => setDistanceMiles(e.target.value)} className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-center shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-800" />
                </div>
                <div className="text-center">
                  <label htmlFor="travelH" className="block text-sm font-medium mb-2">Travel Time One-Way (hours)</label>
                  <input id="travelH" name="travelH" type="number" min="0" step="0.1" placeholder="e.g. 1.4" value={travelHoursOneWay} onChange={(e) => setTravelHoursOneWay(e.target.value)} className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-center shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-800" />
                </div>
                <div className="flex items-end justify-center">
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={isLondon} onChange={(e) => setIsLondon(e.target.checked)} className="h-4 w-4 rounded border-neutral-300" />
                    <span className="text-sm">London (parking/congestion)</span>
                  </label>
                </div>
              </div>

              {/* Dropdowns */}
              <div className="grid sm:grid-cols-2 gap-5">
                <div className="text-center">
                  <label htmlFor="jobType" className="block text-sm font-medium mb-2">Job Type</label>
                  <select id="jobType" name="jobType" required value={jobType} onChange={(e) => setJobType(e.target.value)} className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-center shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-800">
                    <option value="" disabled>Select job type…</option>
                    <option value="polishing">Concrete Polishing</option>
                    <option value="supply-placement-polishing">Concrete Supply, Placement and Polishing</option>
                  </select>
                </div>

                <div className="text-center">
                  <label htmlFor="finishType" className="block text-sm font-medium mb-2">Finish Type</label>
                  <select id="finishType" name="finishType" required value={finishType} onChange={(e) => setFinishType(e.target.value)} className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-center shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-800">
                    <option value="" disabled>Select finish type…</option>
                    <option value="power-trowel-seal">Power Trowel &amp; Seal</option>
                    <option value="rustic-style">Rustic Style Finish</option>
                    <option value="variable-finish">Variable Finish</option>
                    <option value="exposed-aggregate">Exposed Aggregate Finish</option>
                    <option value="hydrated">Hydrated Finish</option>
                    <option value="overlay-rustic" disabled>Overlay Rustic (coming soon)</option>
                    <option value="overlay-exposed" disabled>Overlay Exposed (coming soon)</option>
                  </select>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col items-center gap-3 mt-2">
                <button type="submit" className="inline-flex items-center justify-center rounded-xl bg-neutral-900 text-white px-6 py-3 text-sm sm:text-base font-medium shadow-sm hover:bg-neutral-800 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed">Get Quote</button>
                <p className="text-xs text-neutral-500">All fields required. Supply distance/time for accurate logistics & accommodation logic.</p>
              </div>
            </form>

            {/* Output / Breakdown */}
            {submitted && quote && (
              <div className="mt-8">
                <div className="text-center">
                  <h2 className="text-lg font-semibold">Cost Breakdown</h2>
                  <p className="mt-2 text-sm text-neutral-600">Materials now adjust by finish type. London charges are placeholders until you give rates.</p>
                </div>

                {/* Meta summary */}
                <div className="mt-4 grid sm:grid-cols-2 gap-3">
                  <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-center">
                    <div className="text-xs text-neutral-500">Area</div>
                    <div className="text-base font-medium">{quote.meta.areaM2} m² ({quote.meta.blocks100} × 100m² blocks)</div>
                  </div>
                  <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-center">
                    <div className="text-xs text-neutral-500">Rooms</div>
                    <div className="text-base font-medium">{quote.meta.roomCount}</div>
                  </div>
                  <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-center">
                    <div className="text-xs text-neutral-500">Finish</div>
                    <div className="text-base font-medium">{finishTypeMap[quote.meta.finishType]}</div>
                  </div>
                  <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-center">
                    <div className="text-xs text-neutral-500">Distance / Travel</div>
                    <div className="text-base font-medium">{quote.meta.distanceMiles} mi, {quote.meta.travelHoursOneWay} h one-way</div>
                  </div>
                </div>

                {/* Stage table */}
                <div className="mt-6">
                  <h3 className="text-sm font-semibold mb-2 text-center">Labour by Stage</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-center">
                      <thead>
                        <tr className="text-neutral-600">
                          <th className="py-2">Stage</th>
                          <th className="py-2">Contractors</th>
                          <th className="py-2">Days</th>
                          <th className="py-2">Person-days</th>
                          <th className="py-2">Rate/pp/day</th>
                          <th className="py-2">Labour £</th>
                          <th className="py-2">Vans</th>
                          <th className="py-2">Weeks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quote.stages.map((s, i) => (
                          <tr key={i} className="border-t">
                            <td className="py-2">{s.stage}</td>
                            <td className="py-2">{s.contractors}</td>
                            <td className="py-2">{s.days}</td>
                            <td className="py-2">{s.personDays}</td>
                            <td className="py-2">£{s.rate}</td>
                            <td className="py-2">£{s.labourCost.toLocaleString()}</td>
                            <td className="py-2">{s.vans}</td>
                            <td className="py-2">{s.weeks}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Materials table */}
                <div className="mt-8">
                  <h3 className="text-sm font-semibold mb-2 text-center">Materials</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-center">
                      <thead>
                        <tr className="text-neutral-600">
                          <th className="py-2">Item</th>
                          <th className="py-2">Rate (£/m²)</th>
                          <th className="py-2">Qty (m²)</th>
                          <th className="py-2">Cost £</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quote.materials.list.map((m, i) => (
                          <tr key={i} className="border-t">
                            <td className="py-2 text-left px-2">{m.name}</td>
                            <td className="py-2">£{m.rate.toFixed(2)}</td>
                            <td className="py-2">{m.qty}</td>
                            <td className="py-2">£{m.cost.toLocaleString()}</td>
                          </tr>
                        ))}
                        <tr className="border-t font-semibold">
                          <td className="py-2 text-left px-2">Materials Total</td>
                          <td></td>
                          <td></td>
                          <td className="py-2">£{quote.costs.materialsCost.toLocaleString()}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Totals */}
                <div className="mt-8 grid gap-3">
                  <div className="bg-white border border-neutral-200 rounded-xl p-4">
                    <div className="grid sm:grid-cols-2 gap-3 text-sm">
                      <div className="text-center bg-neutral-50 rounded-lg p-3">
                        <div className="text-neutral-600">Initial Visit</div>
                        <div className="text-lg font-semibold">£{quote.costs.initialVisitCost.toLocaleString()}</div>
                      </div>
                      <div className="text-center bg-neutral-50 rounded-lg p-3">
                        <div className="text-neutral-600">Labour Total</div>
                        <div className="text-lg font-semibold">£{quote.costs.labourTotal.toLocaleString()}</div>
                      </div>
                      <div className="text-center bg-neutral-50 rounded-lg p-3">
                        <div className="text-neutral-600">Accommodation</div>
                        <div className="text-lg font-semibold">£{quote.costs.accommodationCost.toLocaleString()} {quote.meta.needsAccommodation ? "(applied)" : "(n/a)"}</div>
                      </div>
                      <div className="text-center bg-neutral-50 rounded-lg p-3">
                        <div className="text-neutral-600">Fuel</div>
                        <div className="text-lg font-semibold">£{quote.costs.logistics.fuelCost.toLocaleString()}</div>
                      </div>
                      <div className="text-center bg-neutral-50 rounded-lg p-3">
                        <div className="text-neutral-600">Travel Labour</div>
                        <div className="text-lg font-semibold">£{quote.costs.logistics.travelLabourCost.toLocaleString()}</div>
                      </div>
                      {isLondon && (
                        <div className="text-center bg-neutral-50 rounded-lg p-3">
                          <div className="text-neutral-600">Parking/Congestion</div>
                          <div className="text-lg font-semibold">£{quote.costs.logistics.parkingCongestionCost.toLocaleString()} (placeholder)</div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-neutral-900 text-white rounded-2xl p-5 text-center">
                    <div className="text-sm text-neutral-200">Subtotal (excl. VAT & Profit Margin)</div>
                    <div className="text-3xl font-semibold">£{quote.costs.subtotal.toLocaleString()}</div>
                    <div className="text-xs mt-1 opacity-70">Includes labour, accommodation, logistics, and materials. Mesh/concrete depth/pump can be added later.</div>
                  </div>
                  <div className="bg-zinc-900 text-white rounded-2xl p-5 text-center">
                    <div className="text-sm text-neutral-200">Subtotal + Profit Margin (excl. VAT)</div>
                    <div className="text-3xl font-semibold">£{quote.costs.actualTotal.toLocaleString()}</div>
                  </div>

                  <div className="flex justify-center mt-2">
                    <button
                      type="button"
                      onClick={handleExportPdf}
                      className="px-4 py-2 rounded-xl bg-neutral-900 text-white shadow hover:bg-black"
                    >
                      Export PDF
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <footer className="text-center text-xs text-neutral-500 mt-6 mb-10">
            Built my TradeScale - For Concrete Polishing Group 2025
          </footer>
        </div>
      </main>
    </div>
  );
}
