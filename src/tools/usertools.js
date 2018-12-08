const database = require('./database.js');
const { regexValidate } = require('./regex-validation.js');
const { uniqueId, generateUUID } = require('./auth.js');
const bcrypt = require('bcrypt');

class User {
    constructor() {
        this.username = null;
        this.apikey = null;
        this.userid = null;
        this.fullname = null;
        this.permissions = null;
        this.email = null;
        this.hash = null;

        this.deactivated = false;

        this.error = false;
        this.errorMessage = null;
    }

    // PRIVATE
    postError(message) {
        this.error = true;
        this.errorMessage = message;
    }

    save() {
        const userFile = new database.userSchema({
            username: this.username,
            apikey: this.apikey,
            userid: this.userid,
            fullname: this.fullname,
            permissions: this.permissions,
            email: this.email,

            hash: this.hash,

            deactivated: this.deactivated
        });

        userFile.save();
    }

    // PUBLIC

    // Returns true if user has sufficient privilege, false if not
    canPost() {
        return this.permissions.includes('post');
    }
    canAdministrate() {
        return this.permissions.includes('administrate');
    }
    canComment() {
        return this.permissions.includes('comment');
    }
}

function findUser({ username, userid, apikey }) {
    return new Promise(async (resolve, reject) => {
        let user = new User();

        if(username) {
            // Sanitization Checks
            if (regexValidate(username, '[^a-zA-Z\-_0-9]')) {
                await database.userSchema.findOne({'username': username}, (error, usr) => {
                    user = usr;
                });
                resolve(user);
                return;
            } else {
                user.postError('Username is NOT sanitized!');
            }
        } else if(apikey) {
            await database.userSchema.findOne({'apikey': apikey}, (error, usr) => {
                user = usr;
            });
            resolve(user);
            return;
        } else if(userid != null) {
            await database.userSchema.findOne({'userid': userid}, (error, usr) => {
                user = usr;
            });
            resolve(user);
            return;
        }

        resolve(null);
    });
}

function getUser({ username, userid, apikey }) {
    return new Promise(async (resolve, reject) => {
        const user = new User();

        let userSearch = await findUser({ username, userid, apikey })
            .then(userData => userData);

        if(userSearch) {
            if(apikey) {
                const callingUser = await loginUser({apikey: apikey})
                    .then(userData => userData);

                if(callingUser.canAdministrate()) {
                    user.email = userSearch.email;
                    user.permissions = userSearch.permissions;
                    user.deactivated = userSearch.deactivated;
                } else {
                    user.postError('Provided API key does NOT have administration permission!'); // Non-Fatal
                }
            }
            user.username = userSearch.username;
            user.userid = userSearch.userid;
            user.fullname = userSearch.fullname;

            resolve(user);
        } else {
            user.postError('Could not find user!');
            resolve(user);
        }
    });
}

function registerUser({username, password, fullname, email}) {
    return new Promise(async (resolve, reject) => {
        const user = new User();

        // Sanitization checks
        if (regexValidate(password, '[ \'"]')) {
            const userSearch = await findUser({ username: username })
                .then(userData => userData);

            if (!userSearch) {
                // Populate User values
                user.username = username;
                user.fullname = fullname;
                user.email = email;

                user.permissions = ['comment'];

                user.userid = uniqueId();
                user.apikey = generateUUID();

                user.hash = bcrypt.hashSync(password, 10);

                user.save();

                resolve(user);
            } else {
                user.postError('User already exists!');
            }
        } else {
            user.postError('Username and password are NOT sanitized!');
        }

        resolve(user);
    });
}

// Logs the user in
function loginUser({ username, password, apikey }) {
    return new Promise(async (resolve, reject) => {
        const user = new User();

        if(apikey || regexValidate(password, '[ \'"]')) {
            const userSearch = await findUser({ username: username, apikey: apikey })
                .then(userData => userData);

            if (userSearch) {
                if (!userSearch.deactivated) {
                    // Check password
                    if (userSearch.apikey !== apikey) {
                        if (!bcrypt.compareSync(password, userSearch.hash)) {
                            user.postError('Wrong password!');
                            resolve(user);
                            return;
                        }
                    }

                    // Populate User values
                    user.username = userSearch.username;
                    user.fullname = userSearch.fullname;
                    user.email = userSearch.email;

                    user.userid = userSearch.userid;
                    user.apikey = userSearch.apikey;

                    user.permissions = userSearch.permissions;

                    resolve(user);
                    return;
                } else {
                    user.postError('This user is deactivated!');
                }
            } else {
                user.postError('User not found!');
            }
        } else {
            user.postError('Password not sanitized!');
        }

        resolve(user);
    });
}

module.exports = { User, registerUser, loginUser, getUser };
