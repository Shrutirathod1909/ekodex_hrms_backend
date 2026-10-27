const { poolPromise } = require("../config/db");

// Find user by email
const findUserByEmail = async (email) => {
  const pool = await poolPromise;

  const result = await pool.request()
    .input("email", email)
    .query("SELECT * FROM users WHERE email=@email");

  return result.recordset[0];
};

// Save reset token
const saveResetToken = async (email, token, expiry) => {
  const pool = await poolPromise;

  await pool.request()
    .input("email", email)
    .input("token", token)
    .input("expiry", expiry)
    .query(`
      UPDATE users
      SET reset_token=@token,
          reset_token_expiry=@expiry
      WHERE email=@email
    `);
};

// Find user by token
const findUserByToken = async (token) => {
  const pool = await poolPromise;

  const result = await pool.request()
    .input("token", token)
    .query(`
      SELECT * FROM users
      WHERE reset_token=@token
      AND reset_token_expiry > GETDATE()
    `);

  return result.recordset[0];
};

// Update password
const updatePassword = async (id, password) => {
  const pool = await poolPromise;

  await pool.request()
    .input("id", id)
    .input("password", password)
    .query(`
      UPDATE users
      SET password=@password,
          reset_token=NULL,
          reset_token_expiry=NULL
      WHERE id=@id
    `);
};

module.exports = {
  findUserByEmail,
  saveResetToken,
  findUserByToken,
  updatePassword
};