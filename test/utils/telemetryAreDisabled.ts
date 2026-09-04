// `@serverless/test` disables telemetry by stubbing the `lib/utils/telemetry/are-disabled` module of
// the Serverless package under test. OSLS 4.1+ has no telemetry anymore, so the file no longer exists:
// jest maps that module path here (see `jest.config.js`) so that resolving it keeps working.
export = true;
