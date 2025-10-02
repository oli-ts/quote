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

  function calcQuote() {
    const areaM2 = parseFloat(area);
    const roomCount = parseInt(rooms, 10);
    const dist = parseFloat(distanceMiles) || 0;
    const travelH = parseFloat(travelHoursOneWay) || 0;

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
    // Spec says: per 100m² => 2 contractors, 1 day. "These numbers double per extra 100m²".
    // We'll implement LINEAR scaling by blocks (not exponential). Toggle EXPONENTIAL = true to change behaviour.
    const EXPONENTIAL = false;
    let detailContractors = 2;
    let detailDays = 1;
    if (EXPONENTIAL) {
      // doubles per extra 100m²
      if (blocks100 > 1) {
        detailContractors = 2 * (2 ** (blocks100 - 1));
        detailDays = 1 * (2 ** (blocks100 - 1));
      }
    } else {
      // linear scaling
      detailDays = 1 * blocks100;
    }
    const detailing = {
      stage: "Detailing",
      contractors: finishType === "power-trowel-seal" ? 0 : detailContractors,
      days: finishType === "power-trowel-seal" ? 0 : detailDays,
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

    // Parking/Congestion (London only) — PLACEHOLDER: supply your rates to activate
    const parkingCongestionCost = isLondon ? 0 : 0; // TODO: plug real numbers

    // Materials / Mesh / Concrete depth / Pump hire — PLACEHOLDERS
    const materialsCost = 0; // TODO
    const reinforcementMeshCost = 0; // TODO
    const concreteDepthCost = 0; // TODO
    const linePumpHireCost = 0; // TODO

    const logisticsCost = fuelCost + travelLabourCost + parkingCongestionCost;

    const subtotal = labourTotal + accommodationCost + logisticsCost + materialsCost + reinforcementMeshCost + concreteDepthCost + linePumpHireCost;

    return {
      meta: { areaM2, roomCount, blocks100, distanceMiles: dist, travelHoursOneWay: travelH, needsAccommodation, isLondon, jobType, finishType },
      stages: stageLabour,
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
        reinforcementMeshCost: round(reinforcementMeshCost),
        concreteDepthCost: round(concreteDepthCost),
        linePumpHireCost: round(linePumpHireCost),
        subtotal: round(subtotal),
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
                  <p className="mt-2 text-sm text-neutral-600">This is based on the labour/logistics rules you provided. Materials & other line items are placeholders.</p>
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

                {/* Totals */}
                <div className="mt-6 grid gap-3">
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
                    <div className="text-sm text-neutral-200">Subtotal (excl. materials & extras)</div>
                    <div className="text-3xl font-semibold">£{quote.costs.subtotal.toLocaleString()}</div>
                    <div className="text-xs mt-1 opacity-70">Materials, mesh, concrete depth, pump hire currently set to £0 — plug your rules to activate.</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <footer className="text-center text-xs text-neutral-500 mt-6 mb-10">
            Built for Next.js + Tailwind. Fully responsive & centered. Sans-serif everything.
          </footer>
        </div>
      </main>
    </div>
  );
}
