export const prepareUserIndexes = async (UserModel) => {
  let indexes;
  try {
    indexes = await UserModel.collection.indexes();
  } catch (error) {
    if (error?.code !== 26) throw error;
    indexes = [];
  }

  const emailIndex = indexes.find((index) => (
    index.key.email === 1 && Object.keys(index.key).length === 1
  ));
  if (emailIndex && (!emailIndex.unique || !emailIndex.sparse)) {
    await UserModel.collection.dropIndex(emailIndex.name);
  }
  await UserModel.createIndexes();
};
