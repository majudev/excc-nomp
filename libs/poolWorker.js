var stratum = require('stratum');
var redis   = require('redis');
var net     = require('net');

var MposCompatibility = require('./mposCompatibility.js');
var ShareProcessor = require('./shareProcessor.js');

module.exports = function(logger){

    var _this = this;

    var portalConfig = JSON.parse(process.env.portalConfig);
    var poolConfig  = portalConfig.pool;
    var forkId = process.env.forkId;

    var proxySwitch = {};

    var redisClient = redis.createClient(portalConfig.redis.port, portalConfig.redis.host);

    var logSystem = 'Pool';
    var logComponent = poolConfig.coin.name;
    var logSubCat = 'Thread ' + (parseInt(forkId) + 1);

    var handlers = {
        auth: function(){},
        share: function(){},
        diff: function(){}
    };

    //Functions required for internal payment processing
    var shareProcessor = new ShareProcessor(logger, portalConfig);

    handlers.auth = function(workerName, password, authCallback){
        if (poolConfig.validateWorkerUsername !== true)
             authCallback(true);
        else {
             if (workerName.length === 40) {
                try {
                    new Buffer(workerName, 'hex');
                    authCallback(true);
                }
                catch (e) {
                    authCallback(false);
                }
            }
            else {
                /*stratum.Daemon.cmd('validateaddress', [workerName], function (results) {
                    var isValid = results.filter(function (r) {
                        return r.response.isvalid
                    }).length > 0;
                    authCallback(isValid);
                });*/
              authCallback(true); //temprorary solution
            }
        }
    };


    handlers.share = function(isValidShare, isValidBlock, data){
        shareProcessor.handleShare(isValidShare, isValidBlock, data);
    };

    var authorizeFN = function (workerName, password, callback) {
        handlers.auth(workerName, password, function(authorized){
            var authString = authorized ? 'Authorized' : 'Unauthorized ';
            logger.debug(logSystem, logComponent, logSubCat, authString + ' ' + workerName + ':' + password + ' [' + ip + ']');
            callback({
                error: null,
                authorized: authorized,
                disconnect: false
            });
        });
    };


    var pool = new stratum.Server(poolConfig.stratum);
    pool.on('mining', function(req, deferred, socket){
    	  switch (req.method) {
		    /*    case 'subscribe':
                logger.debug(logSystem, logComponent, 'Client is asking for subscription!');

                deferred
                .resolve([
                    'b4b6693b72a50c7116db18d6497cac52',  // difficulty
                    'ae6812eb4cd7735a302a8a9dd95cf71f',  // subscription_id
                    '08000002',                          // extranonce1
                    4                                    // extranonce2_size
                ]);

                // the resulting command will be [[["mining.set_difficulty", "b4b6693b72a50c7116db18d6497cac52"], ["mining.notify", "ae6812eb4cd7735a302a8a9dd95cf71f"]], "08000002", 4]

                // you may send an error to the client by rejecting the deferred
                // deferred.reject(Server.errors.UNKNOWN);
                break;*/
		        case 'authorize':
                console.log('Authorizing worker ' + req.params[0]);

                authorizeFN(req.params[0], req.params[1], function(result){
                    // true = authorized or false = not authorized
                    deferred.resolve([result.authorized]);
                });

                deferred.promise.then(function(){
                    socket.set_difficulty(['b4b6693b72a50c7116db18d6497cac52']).then(function(){
                      console.log('Sent difficulty');
                    }, function(){
                      console.log('Failed to send difficulty');
                    });

                    //SCRYPT
                    socket.notify([
                      'bf',      // job_id
                      'b61b385ce17b7f9e4d1586ee0cfa7bc0778fe63bffe0240bd9d228f2829b7f0b', // previous_hash
                      '01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff2303700706062f503253482f042a91f15108', // coinbase1
                      '092f7374726174756d2f00000000018091db2a010000001976a914e63c288f379eea1a32305932d957d70b69e21dff88ac00000000',         // coinbase2
                      ['4d31368c61b556105d936a0bf2f7d772e19375d2997fbf8d9eae5c5e089b2910', '012b5c89cff28de2400d192a3d8ed55b5d19f026f77d95838b3af2aefd0304a4'], // branches
                      '00000001', // block_version
                      '1b494a04', // nbit
                      '51f1912a', // ntime
                      true        // clean

                    ]).then(function(){
                      console.log('Sent work');
                    }, function(){
                      console.log('Failed to send work');
                    });
                });
                break;
		        case 'submit':
                // temprorary solution
                if (Math.random() * 10 + 1 < 3.141516) {
                    deferred.resolve([false]);
                } else {
                    deferred.resolve([true]);
                }
                //shareProcessor.handleShare(isValidShare, isValidBlock, data);
                break;
		        default:
                deferred.reject(Server.errors.METHOD_NOT_FOUND);
	      }
    });
    pool.on('mining.error', function(error, socket){
	      logger.debug(logSystem, logComponent, 'Mining error: ', error);
	  });
    /*pool.on('rpc', function(name, args, connection, deferred){
      // these two come out of the box, but you may add your own functions as well
      // using server.rpc.expose('name', function(){}, context);

      console.log(name, args);
      // args is ['hash','daemonname']

      switch (name) {
      case 'mining.connections':
        // "someone" is asking for the connections on this app, let's return the ids
        deferred.resolve([
        this.lodash.map(server.clients, function(client){
          return {id: client.id, ip: client.address().address };
        })
        ]); // always resolve using array

        // or we can deny it
        deferred.reject(['Im not showing it to you']);

        break;
      case 'mining.wallet':
        // walletnotify
        deferred.resolve(['uhum']);
        break;
      case 'mining.alert':
        // alertnotify
        deferred.resolve(['gotcha']);
        break;
      case 'mining.block':
        // bitcoind is sending us a new block, there's no need to answer with
        // real data, unless the other end if doing some log

        deferred.resolve(['Block updated']); // always resolve using array
        break;
      default:
        deferred.reject(['invalid command']);
      }
    });*/
    /*pool.on('share', function(isValidShare, isValidBlock, data){

        var shareData = JSON.stringify(data);

        if (data.blockHash && !isValidBlock)
            logger.debug(logSystem, logComponent, logSubCat, 'We thought a block was found but it was rejected by the daemon, share data: ' + shareData);

        else if (isValidBlock)
            logger.debug(logSystem, logComponent, logSubCat, 'Block found: ' + data.blockHash + ' by ' + data.worker);

        if (isValidShare) {
            if(data.shareDiff > 1000000000)
                logger.debug(logSystem, logComponent, logSubCat, 'Share was found with diff higher than 1.000.000.000!');
            else if(data.shareDiff > 1000000)
                logger.debug(logSystem, logComponent, logSubCat, 'Share was found with diff higher than 1.000.000!');
            logger.debug(logSystem, logComponent, logSubCat, 'Share accepted at diff ' + data.difficulty + '/' + data.shareDiff + ' by ' + data.worker + ' [' + data.ip + ']' );

        } else if (!isValidShare)
            logger.debug(logSystem, logComponent, logSubCat, 'Share rejected: ' + shareData);

        handlers.share(isValidShare, isValidBlock, data)


    }).on('difficultyUpdate', function(workerName, diff){
        logger.debug(logSystem, logComponent, logSubCat, 'Difficulty update to diff ' + diff + ' workerName=' + JSON.stringify(workerName));
        handlers.diff(workerName, diff);
    }).on('log', function(severity, text) {
        logger[severity](logSystem, logComponent, logSubCat, text);
    }).on('banIP', function(ip, worker){
        process.send({type: 'banIP', ip: ip});
    }).on('started', function(){
        _this.setDifficultyForProxyPort(pool, poolOptions.coin.name, poolOptions.coin.algorithm);
    });*/

    pool.listen().done(function(msg){
	      logger.debug(logSystem, logComponent, msg);
	  });
};
