const { requireAuth } = require("./auth");

function requireOwner(req, res, next) {

    requireAuth(req, res, () => {

        if (req.role !== "owner") {

            return res.status(403).json({
                error: "Owner access required."
            });

        }

        next();

    });

}

module.exports = { requireOwner };