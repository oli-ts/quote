export default {
  async fetch(req) {
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: {
          "content-type": "application/json",
          "access-control-allow-origin": "*",           // lock down in prod
          "access-control-allow-methods": "POST,OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      });

    if (req.method === "OPTIONS") return json({});
    if (req.method !== "POST") return json({ ok: false, error: "Use POST" }, 405);

    try {
      const body = await req.json();
      const { input, ratesOverride } = body || {};
      if (!input) return json({ ok: false, error: "Missing 'input'" }, 400);

      // ===== Helpers =====
      const ceilDiv = (a, b) => Math.ceil(a / b);
      const round = (n, dp = 2) => Math.round((n + Number.EPSILON) * 10 ** dp) / 10 ** dp;
      const ceilDivWithTolerance = (value, blockSize = 100, tolerance = 20) =>
        value <= blockSize + tolerance ? 1 : Math.ceil((value - tolerance) / blockSize);

      // ===== Rates (mirrors your Next page; override via ratesOverride) =====
      const RATES = {
        initialVisitPerPersonPerDay: 350,
        prepPerPersonPerDay: 250,
        placementPerPersonPerDay: 400,
        jointCutPerPersonPerDay: 250,
        polishingPerPersonPerDay: 400,   // TODO: confirm if different
        detailingPerPersonPerDay: 250,   // TODO: confirm if different
        accommodationPerPersonPerDay: 60,
        travelLabourPerHourPerLeg: 15,
        fuelPerMileFactor: 0.76,
        peoplePerVan: 3,
        daysPerWeek: 5,
        londonParkingPerVanPerDay: 0,
        londonCongestionPerVanPerDay: 0,
        ...ratesOverride,
      };

      // ===== Input =====
      const {
        areaM2,
        rooms,
        location = "",
        isLondon = false,
        distanceMiles = 0,
        travelHoursOneWay = 0,
        jobType = "",
        finishType, // "power-trowel-seal" | "rustic-style" | "variable-finish" | "exposed-aggregate" | "hydrated"
        profitPercent,
      } = input;

      if (!(areaM2 > 0)) return json({ ok: false, error: "areaM2 must be > 0" }, 400);
      if (!Number.isInteger(rooms) || rooms <= 0) return json({ ok: false, error: "rooms must be a positive integer" }, 400);
      if (!finishType) return json({ ok: false, error: "finishType is required" }, 400);

      const dist = Number(distanceMiles) || 0;
      const travelH = Number(travelHoursOneWay) || 0;

      // ===== Materials =====
      function calcMaterials(area, finish) {
        const standardRates = {
          "Perimeter Isolation Foam": 0.5,
          "Plastic angle trim": 0.25,
          "Plant Hire": 2,
          "Reinforcement fibres": 0.5,
          "Misc Preparation Materials (Glue, Tape, blades, staples, etc)": 2,
          "Joint cutting blades": 0.5,
          "Floor Protection (Antinox + TPS)": 1.5,
        };
        const colourSurfaceHardener = {
          "exposed-aggregate": 12,
          "variable-finish": 12,
          "rustic-style": 3,           // <- your latest change
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
          name, rate, per: "m²", qty: area, cost: rate * area,
        }));
        const variable = [
          { name: "Colour Surface Hardener",
            rate: colourSurfaceHardener[finish] || 0, per: "m²", qty: area,
            cost: (colourSurfaceHardener[finish] || 0) * area },
          { name: "Polishing Materials, Tooling, Sealer & Consumables",
            rate: polishingMaterials[finish] || 0, per: "m²", qty: area,
            cost: (polishingMaterials[finish] || 0) * area },
        ];

        const list = [...std, ...variable];
        const total = list.reduce((s, m) => s + m.cost, 0);
        return { list, total };
      }

      // ===== Labour & Logistics =====
      const blocks100 = Math.max(1, ceilDivWithTolerance(areaM2, 100, 20));
      const additionalRooms = Math.max(0, rooms - 1);

      // Pouring stages
      const prep = { stage: "Preparation", contractors: 2, days: blocks100 + additionalRooms, rate: RATES.prepPerPersonPerDay };
      const placementContractors = 4 + (finishType === "hydrated" ? 2 : 0);
      const placement = { stage: "Placement & Power Trowel", contractors: placementContractors, days: blocks100 + additionalRooms, rate: RATES.placementPerPersonPerDay };
      const joint = { stage: "Joint Cutting & Cover", contractors: 2, days: blocks100 + additionalRooms, rate: RATES.jointCutPerPersonPerDay };

      // Polishing + Detailing
      const POLISH_RULES = {
        "power-trowel-seal": { contractors: 0, daysPer100: 0 },
        "rustic-style": { contractors: 2, daysPer100: 3 },
        "variable-finish": { contractors: 3, daysPer100: 4 },
        "exposed-aggregate": { contractors: 3, daysPer100: 5 },
        hydrated: { contractors: 3, daysPer100: 4 },
      };
      const pr = POLISH_RULES[finishType] || { contractors: 0, daysPer100: 0 };
      const polishing = { stage: "Polishing", contractors: pr.contractors, days: pr.daysPer100 * blocks100, rate: RATES.polishingPerPersonPerDay };
      const detailContractors = finishType === "power-trowel-seal" ? 0 : 2;
      const detailDays = finishType === "power-trowel-seal" ? 0 : 1 * blocks100;
      const detailing = { stage: "Detailing", contractors: detailContractors, days: detailDays, rate: RATES.detailingPerPersonPerDay };

      const stagesRaw = [prep, placement, joint, polishing, detailing].filter(s => s.contractors > 0 && s.days > 0);

      // Initial visit
      const initialVisitPeople = 1 + Math.floor(Math.max(0, areaM2 - 1) / 250);
      const initialVisitCost = initialVisitPeople * RATES.initialVisitPerPersonPerDay;

      // Stage calcs
      const stages = stagesRaw.map(s => ({
        ...s,
        personDays: s.contractors * s.days,
        labourCost: s.contractors * s.days * s.rate,
        weeks: ceilDiv(s.days, RATES.daysPerWeek),
        vans: Math.max(1, Math.ceil(s.contractors / RATES.peoplePerVan)),
      }));
      const labourTotal = stages.reduce((sum, s) => sum + s.labourCost, 0) + initialVisitCost;

      // Accommodation
      const totalPersonDays = stages.reduce((sum, s) => sum + s.personDays, 0);
      const needsAccommodation = travelH > 1.5;
      const accommodationCost = needsAccommodation ? totalPersonDays * RATES.accommodationPerPersonPerDay : 0;

      // Fuel
      const fuelCost = stages.reduce((sum, s) =>
        sum + (s.vans * (Number(dist) || 0) * s.weeks * RATES.fuelPerMileFactor), 0);

      // Travel labour
      let travelLabourCost = 0;
      if (!needsAccommodation) {
        const perPersonPerDay = 2 * (Number(travelH) || 0) * RATES.travelLabourPerHourPerLeg;
        stages.forEach(s => { travelLabourCost += s.contractors * s.days * perPersonPerDay; });
      } else {
        const legsPerWeek = 2;
        const perPersonPerWeek = legsPerWeek * (Number(travelH) || 0) * RATES.travelLabourPerHourPerLeg;
        stages.forEach(s => { travelLabourCost += s.contractors * s.weeks * perPersonPerWeek; });
      }

      // London parking + congestion (daily per van; placeholders)
      const londonDays = stages.reduce((sum, s) => sum + s.days, 0);
      const londonVansAvg = stages.length ? Math.round(stages.reduce((sum, s) => sum + s.vans, 0) / stages.length) : 0;
      const parkingCongestionCost = isLondon
        ? (londonDays * londonVansAvg * (RATES.londonParkingPerVanPerDay + RATES.londonCongestionPerVanPerDay))
        : 0;

      // Materials
      const materials = calcMaterials(areaM2, finishType);
      const materialsCost = materials.total;

      // Totals + Profit
      const logisticsCost = fuelCost + travelLabourCost + parkingCongestionCost;
      const subtotal = labourTotal + accommodationCost + logisticsCost + materialsCost;

      const clampedProfit = Math.min(40, Math.max(5, Number(profitPercent ?? 30)));
      const profitMargin = clampedProfit / 100;
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

      // Response mirrors your page structure
      return json({
        ok: true,
        result: {
          meta: {
            areaM2,
            roomCount: rooms,
            blocks100,
            distanceMiles: dist,
            travelHoursOneWay: travelH,
            needsAccommodation,
            isLondon,
            jobType,
            finishType,
            profitPercent: clampedProfit,
            location,
          },
          stages,
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
            actualTotal: round(actualTotal),
            withProfit,
          },
        },
      });
    } catch (e) {
      return json({ ok: false, error: e.message || "Bad Request" }, 400);
    }
  },
};
