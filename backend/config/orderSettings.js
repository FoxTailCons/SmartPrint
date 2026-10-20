const parsePositiveInteger = (env, key, defaultValue) => {
  const raw = env[key];
  if (raw === undefined) return defaultValue;
  if (typeof raw === 'string' && !raw.trim()) throw new Error(`${key} deve ser um inteiro positivo`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${key} deve ser um inteiro positivo`);
  return value;
};

const parseNonnegativeNumber = (env, key, defaultValue) => {
  const raw = env[key];
  if (raw === undefined) return defaultValue;
  if (typeof raw === 'string' && !raw.trim()) throw new Error(`${key} deve ser um número maior ou igual a zero`);
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${key} deve ser um número maior ou igual a zero`);
  return value;
};

export function getOrderSettings(env = process.env) {
  return {
    quoteValidityDays: parsePositiveInteger(env, 'QUOTE_VALIDITY_DAYS', 7),
    clientRequiredThreshold: parseNonnegativeNumber(env, 'ORDER_CLIENT_REQUIRED_THRESHOLD', 100),
    businessAddress: String(env.BUSINESS_ADDRESS || '').trim(),
    businessPhone: String(env.BUSINESS_PHONE || '').trim(),
    businessPixKey: String(env.BUSINESS_PIX_KEY || '').trim(),
    businessInstagram: String(env.BUSINESS_INSTAGRAM || '@smartprint.lindoia').trim(),
  };
}
