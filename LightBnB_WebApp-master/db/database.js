const properties = require("./json/properties.json");
const users = require("./json/users.json");
const pg = require('pg');

const Pool = pg.Pool;

const config = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS
};

const pool = new Pool(config);

// Test driver code
// pool.connect()
//   .then(() => {
//     getAllProperties()
//     // console.log(`${process.env.DB_NAME}`);
//     // return pool.query(`SELECT title FROM properties LIMIT 10;`);
//   })
//   // .then(response => {
//   //   console.log(`Quuery Results:`, response);
//   // })
//   // .catch(error => {
//   //   console.error(`Error connecting to database or executing query:`, error);
//   //   pool.end(); // Close the connection pool in case of error
//   // });


/// Users

/**
 * Get a single user from the database given their email.
 * @param {String} email The email of the user.
 * @return {Promise<{}>} A promise to the user.
 */

const getUserWithEmail = function (email) {
  return pool
    .query(`
      SELECT name, email, password, id FROM users
        WHERE email = $1;
    `,
    [email]
    )
    .then((result) => {
      if (result.rows.length > 0) {
        return {
          name: result.rows[0].name,
          email: result.rows[0].email,
          password: result.rows[0].password,
          id: result.rows[0].id
        };
      } else {
        return null;
      }  
    })
    .catch((err) => {
      console.log(err.message);
    });
};

/**
 * Get a single user from the database given their id.
 * @param {string} id The id of the user.
 * @return {Promise<{}>} A promise to the user.
 */
// refactor
const getUserWithId = function (id) {
  return pool
    .query(`
      SELECT name, email, password, id FROM users
        WHERE id = $1;
    `,
    [id]
    )
    .then((result) => {
      if (result.rows.length > 0) {
        return {
          name: result.rows[0].name,
          email: result.rows[0].email,
          password: result.rows[0].password,
          id: result.rows[0].id
        };
      } else {
        return null;
      }  
    })
    .catch((err) => {
      console.log(err.message);
    });
};


/**
 * Add a new user to the database.
 * @param {{name: string, password: string, email: string}} user
 * @return {Promise<{}>} A promise to the user.
 */

const addUser = function (user) {
  return pool
    .query(`
      INSERT INTO users (name, email, password)
      VALUES ($1, $2, $3)
      RETURNING *;
    `,
    [user.name, user.email, user.password]
    )
    .then((result) => {
        return {
          name: result.rows[0].name,
          email: result.rows[0].email,
          password: result.rows[0].password,
          id: result.rows[0].id
        };
    })
    .catch((err) => {
      console.log(err.message);
    });
}

/// Reservations

/**
 * Get all reservations for a single user.
 * @param {string} guest_id The id of the user.
 * @return {Promise<[{}]>} A promise to the reservations.
 */
const getAllReservations = function (guest_id, limit = 10) {
  return pool
    .query(`
      SELECT reservations.id, properties.*, start_date, end_date, AVG(property_reviews.rating) AS average_rating
      FROM reservations
      JOIN properties ON properties.id = property_id
      JOIN property_reviews ON property_reviews.property_id = properties.id
      WHERE reservations.guest_id = $1
      GROUP BY reservations.id, properties.id, properties.cost_per_night
      ORDER BY start_date
      LIMIT $2;
    `,
    [guest_id, limit]
    )
    .then((result) => {
        return result.rows
    })
    .catch((err) => {
      console.log(err.message);
    });
};

/// Properties
/**
 * Get all properties.
 * @param {{}} options An object containing query options.
 * @param {*} limit The number of results to return.
 * @return {Promise<[{}]>}  A promise to the properties.
 */

// const getAllProperties1 = (options, limit = 10) => {
//   return pool
//     .query(`
//       SELECT * FROM properties
//         LIMIT $1;
//       `,
//       [limit])
//     .then((result) => {
//       return result.rows
//     })
//     .catch((err) => {
//       console.log(err.message);
//     });
// };
// Refactor refactor
const getAllProperties = (options, limit = 10) => {
  const queryParams= [];
  // 

  let queryString = `
    SELECT properties.*, avg(property_reviews.rating) as average_rating
    FROM properties
    JOIN property_reviews ON properties.id = property_id
    `;

  if (options.city) {
    queryParams.push(`%${options.city}%`);
    queryString += `WHERE city LIKE $${queryParams.length} `;
  }

  if (options.owner_id) {
    queryParams.push(options.owner_id);
    queryString += `AND owner_id = $${queryParams.length} `;
  }

  if (options.minimum_price_per_night) {
    const minPriceInCents = parseFloat(options.minimum_price_per_night) * 100;
    queryParams.push(minPriceInCents);
    queryString += `AND cost_per_night > $${queryParams.length}`;
  }

  if (options.maximum_price_per_night) {
    const maxPriceInCents = parseFloat(options.maximum_price_per_night) * 100;
    queryParams.push(maxPriceInCents);
    queryString += `AND cost_per_night < ($${queryParams.length}) `;
  }

  // Deal with not using having on aggregate min rating by performing a sub q first.
  let subQueryString = '';

  if (options.minimum_rating) {
    queryParams.push(options.minimum_rating);

    subQueryString = `
      SELECT property_id
      FROM property_reviews
      GROUP BY property_id
      HAVING avg(rating) >= $${queryParams.length}
    `;
  }

  if (subQueryString) {
    queryString += `AND properties.id IN (${subQueryString}) `;
  }


  queryParams.push(limit);
  queryString += `
    GROUP BY properties.id
    ORDER BY cost_per_night
    LIMIT $${queryParams.length};
  `;
  console.log(queryString, queryParams);

  return pool
    .query(queryString, queryParams)
    .then((result) => {
      return result.rows
    })
    .catch((err) => {
      console.log(err.message);
    });
};

/**
 * Add a property to the database
 * @param {{}} property An object containing all of the property details.
 * @return {Promise<{}>} A promise to the property.
 */
const addProperty = function (property) {
  const propertyId = Object.keys(properties).length + 1;
  property.id = propertyId;
  properties[propertyId] = property;
  return Promise.resolve(property);
};

module.exports = {
  getUserWithEmail,
  getUserWithId,
  addUser,
  getAllReservations,
  getAllProperties,
  addProperty,
};
