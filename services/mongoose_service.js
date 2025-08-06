// Generic Mongoose service for CRUD operations
const connectDatabase = require('./database.js');

const findAll = async (Model, query = {}, options = {}) => {
  await connectDatabase();
  let mongooseQuery = Model.find(query);
  
  if (options.select) {
    mongooseQuery = mongooseQuery.select(options.select);
  }
  
  if (options.sort) {
    mongooseQuery = mongooseQuery.sort(options.sort);
  }
  
  if (options.skip) {
    mongooseQuery = mongooseQuery.skip(options.skip);
  }
  
  if (options.limit) {
    mongooseQuery = mongooseQuery.limit(options.limit);
  }
  
  if (options.lean) {
    mongooseQuery = mongooseQuery.lean();
  }
  
  return await mongooseQuery;
};

const findOne = async (Model, query) => {
  await connectDatabase();
  return await Model.findOne(query);
};

const findById = async (Model, id) => {
  await connectDatabase();
  return await Model.findById(id);
};

const insertOne = async (Model, data) => {
  await connectDatabase();
  const document = new Model(data);
  return await document.save();
};

const updateOne = async (Model, filter, update, options = {}) => {
  await connectDatabase();
  return await Model.findOneAndUpdate(filter, update, { new: true, ...options });
};

const updateById = async (Model, id, update, options = {}) => {
  await connectDatabase();
  return await Model.findByIdAndUpdate(id, update, { new: true, ...options });
};

const deleteOne = async (Model, filter) => {
  await connectDatabase();
  return await Model.findOneAndDelete(filter);
};

const deleteById = async (Model, id) => {
  await connectDatabase();
  return await Model.findByIdAndDelete(id);
};

const countDocuments = async (Model, query = {}) => {
  await connectDatabase();
  return await Model.countDocuments(query);
};

const exists = async (Model, query) => {
  await connectDatabase();
  return await Model.exists(query);
};

const distinct = async (Model, field, query = {}) => {
  await connectDatabase();
  return await Model.distinct(field, query);
};

const updateMany = async (Model, filter, update, options = {}) => {
  await connectDatabase();
  return await Model.updateMany(filter, update, options);
};

module.exports = {
  findAll,
  findOne,
  findById,
  insertOne,
  updateOne,
  updateById,
  deleteOne,
  deleteById,
  countDocuments,
  exists,
  distinct,
  updateMany
};