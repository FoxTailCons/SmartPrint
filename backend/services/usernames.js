const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,39}$/;

export const normalizeUsername = (value) => (
  typeof value === 'string' ? value.trim().toLowerCase() : ''
);

export const isValidUsername = (value) => usernamePattern.test(value);

export const usernameFromEmail = (email) => {
  const localPart = String(email || '').split('@')[0]
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '');
  const base = (localPart || 'usuario').slice(0, 40);
  return base.length >= 3 ? base : `${base}-user`;
};

export const findAvailableUsername = async (base, isTaken) => {
  for (let suffix = 1; suffix <= 10000; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base.slice(0, 40 - String(suffix).length)}${suffix}`;
    if (!await isTaken(candidate)) return candidate;
  }
  throw new Error('Não foi possível gerar um nome de usuário único');
};

export const migrateUsernames = async (UserModel) => {
  const users = await UserModel.find({}).select('_id email username').sort({ email: 1, _id: 1 });
  let migrated = 0;
  for (const user of users) {
    if (normalizeUsername(user.username)) continue;
    const base = usernameFromEmail(user.email);
    user.username = await findAvailableUsername(base, async (username) => (
      Boolean(await UserModel.findOne({ username, _id: { $ne: user._id } }).select('_id'))
    ));
    await user.save();
    migrated += 1;
  }
  return migrated;
};
