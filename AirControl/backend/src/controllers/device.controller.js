import { query, queryOne } from "../db.js";

function buildRequestedBy(auth) {
  if (!auth) return { source: "device" };
  return { userId: auth.uid, username: auth.username, role: auth.role };
}

function normalizeBoolean(value) {
  if (value === true || value === false) return value;
  const raw = String(value || "").toLowerCase();
  if (["1", "true", "on", "open"].includes(raw)) return true;
  if (["0", "false", "off", "close"].includes(raw)) return false;
  return null;
}

function normalizeInt(value, min, max, label) {
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    throw new Error(`${label} must be integer`);
  }
  if (num < min || num > max) {
    throw new Error(`${label} must be ${min}..${max}`);
  }
  return num;
}

async function ensureConfig(deviceCode) {
  await query(
    "insert into device_config (device_code) values ($1) on conflict (device_code) do nothing",
    [deviceCode]
  );
  return queryOne("select * from device_config where device_code = $1", [deviceCode]);
}

async function ensureState(deviceCode) {
  await query(
    "insert into device_state (device_code) values ($1) on conflict (device_code) do nothing",
    [deviceCode]
  );
  return queryOne("select * from device_state where device_code = $1", [deviceCode]);
}

export async function getState(req, res, next) {
  try {
    const deviceCode = req.params.deviceCode;
    const config = await ensureConfig(deviceCode);
    const state = await ensureState(deviceCode);

    return res.json({
      deviceCode,
      state: {
        light1: state.light1,
        light2: state.light2,
        light3: state.light3,
        airOnMinutes: state.air_on_minutes,
        updatedAt: state.updated_at,
        updatedBy: state.updated_by
      },
      config: {
        airCycleMinutes: config.air_cycle_minutes,
        updatedAt: config.updated_at,
        updatedBy: config.updated_by
      }
    });
  } catch (err) {
    return next(err);
  }
}

export async function updateState(req, res, next) {
  try {
    const deviceCode = req.params.deviceCode;
    const config = await ensureConfig(deviceCode);
    const state = await ensureState(deviceCode);

    const light1 = normalizeBoolean(req.body?.light1 ?? state.light1);
    const light2 = normalizeBoolean(req.body?.light2 ?? state.light2);
    const light3 = normalizeBoolean(req.body?.light3 ?? state.light3);
    const airOnMinutes =
      req.body?.airOnMinutes != null ? normalizeInt(req.body.airOnMinutes, 0, 240, "airOnMinutes") : state.air_on_minutes;

    await query(
      "update device_state set light1 = $1, light2 = $2, light3 = $3, air_on_minutes = $4, updated_at = now(), updated_by = $5 where device_code = $6",
      [light1, light2, light3, airOnMinutes, JSON.stringify(buildRequestedBy(null)), deviceCode]
    );

    return res.json({
      ok: true,
      deviceCode,
      state: {
        light1,
        light2,
        light3,
        airOnMinutes,
        airCycleMinutes: config.air_cycle_minutes
      }
    });
  } catch (err) {
    return next(err);
  }
}

export async function enqueueCommand(req, res, next) {
  try {
    const deviceCode = req.params.deviceCode;
    const config = await ensureConfig(deviceCode);
    const state = await ensureState(deviceCode);

    const { type } = req.body ?? {};
    if (!type || !["light", "air"].includes(type)) {
      return res.status(400).json({ error: "type must be light or air" });
    }

    let nextState = {
      light1: state.light1,
      light2: state.light2,
      light3: state.light3,
      air_on_minutes: state.air_on_minutes
    };

    if (type === "light") {
      const channel = normalizeInt(req.body?.channel, 1, 3, "channel");
      const value = normalizeBoolean(req.body?.state);
      if (value == null) {
        return res.status(400).json({ error: "state must be boolean" });
      }
      nextState[`light${channel}`] = value;
    }

    if (type === "air") {
      const maxMinutes = config.air_cycle_minutes || 10;
      const onMinutes = normalizeInt(req.body?.onMinutes, 0, maxMinutes, "onMinutes");
      nextState.air_on_minutes = onMinutes;
    }

    await query(
      "update device_state set light1 = $1, light2 = $2, light3 = $3, air_on_minutes = $4, updated_at = now(), updated_by = $5 where device_code = $6",
      [
        nextState.light1,
        nextState.light2,
        nextState.light3,
        nextState.air_on_minutes,
        JSON.stringify(buildRequestedBy(req.auth)),
        deviceCode
      ]
    );

    await query(
      "insert into command_log (device_code, command_type, payload, created_by) values ($1, $2, $3, $4)",
      [deviceCode, type, JSON.stringify(req.body ?? {}), JSON.stringify(buildRequestedBy(req.auth))]
    );

    return res.status(201).json({
      ok: true,
      deviceCode,
      state: {
        light1: nextState.light1,
        light2: nextState.light2,
        light3: nextState.light3,
        airOnMinutes: nextState.air_on_minutes,
        airCycleMinutes: config.air_cycle_minutes
      }
    });
  } catch (err) {
    return next(err);
  }
}

export async function getHistory(req, res, next) {
  try {
    const deviceCode = req.params.deviceCode;
    const limit = Math.min(Number(req.query?.limit || 50), 200);
    const rows = await query(
      "select id, command_type as type, payload, created_at, created_by from command_log where device_code = $1 order by created_at desc limit $2",
      [deviceCode, limit]
    );
    return res.json({ deviceCode, items: rows });
  } catch (err) {
    return next(err);
  }
}

export async function getConfig(req, res, next) {
  try {
    const deviceCode = req.params.deviceCode;
    const config = await ensureConfig(deviceCode);
    return res.json({
      deviceCode,
      config: {
        airCycleMinutes: config.air_cycle_minutes,
        updatedAt: config.updated_at,
        updatedBy: config.updated_by
      }
    });
  } catch (err) {
    return next(err);
  }
}

export async function setConfig(req, res, next) {
  try {
    const deviceCode = req.params.deviceCode;
    const current = await ensureConfig(deviceCode);

    const airCycleMinutes =
      req.body?.airCycleMinutes != null
        ? normalizeInt(req.body.airCycleMinutes, 1, 240, "airCycleMinutes")
        : current.air_cycle_minutes;

    await query(
      "update device_config set air_cycle_minutes = $1, updated_at = now(), updated_by = $2 where device_code = $3",
      [airCycleMinutes, JSON.stringify(buildRequestedBy(req.auth)), deviceCode]
    );

    const state = await ensureState(deviceCode);
    if (state.air_on_minutes > airCycleMinutes) {
      await query(
        "update device_state set air_on_minutes = $1, updated_at = now(), updated_by = $2 where device_code = $3",
        [airCycleMinutes, JSON.stringify(buildRequestedBy(req.auth)), deviceCode]
      );
    }

    await query(
      "insert into command_log (device_code, command_type, payload, created_by) values ($1, $2, $3, $4)",
      [deviceCode, "config", JSON.stringify({ airCycleMinutes }), JSON.stringify(buildRequestedBy(req.auth))]
    );

    return res.json({ ok: true, deviceCode, config: { airCycleMinutes } });
  } catch (err) {
    return next(err);
  }
}
