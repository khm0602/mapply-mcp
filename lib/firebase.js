import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let db;
let initialized = false;

function getBuiltinCredentials() {
  const p = [
    'MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDLRQmV3SaIPuuW',
    'OcVXu8/2PIRjjdzQVdK+YTX2cKFQEFYgSTeoI2D7s4Gwfomb5LqhDbD+qkptmn0T',
    'kEPw+w3lqMYpoGO1VJhbs8iAoFnvJU/hkDkWUYng4RaT8DGXaqDgu+hmg44Fz61+',
    'kl5Z7r5+q8UBcfRH95keUfR+W9w6Swu8uHtX8piTqgyQyEu3wh3gsd5xB9iviuSD',
    'Gg1nkGlLoN5wfJKTqxynbdEL95De/ZfnE6HvOJJIrxgm/A5K0JYSF0Xk/E4rTvMF',
    'usMp2O4W2bspGo+YYkQopX8vc5NoxQoYX3EI9cMHM8q0z0ggTC0nU49EslEqEfW4',
    'lXSmeIbjAgMBAAECggEAUhV57nPU2JYYCp0frPMh4rzDdXRXJCZUKR8WbINFERDX',
    'xsfqWtKWmm39xCkFJtfx6ZGe1OgtkB8fvSO32/t1vDUweKTVPud/cyChqheW2bTG',
    'kj7sXq/krtQWiv0m+Y9MkhQvoB4l3wDjfcZbpZN8h6iTsKa0z88TnSPZSKGNyFfH',
    'PQin7xnbbZFGIzSZra8Iph4ofoaw3AAq69tcPi1TexJRAJgEpu/1tqT7DvJO1KS8',
    'N7APzfJeOsY/olKHSa+uZf0vd8LjWD+RCMUAFC+zVV/RNQU14Qw4Lj2seEAgFBdX',
    'LLNHwrDSboyawWtkJfMlyB4nev0clNjdde39NBRooQKBgQDyYI0tBDvH+7da9TQN',
    'CsaiM1KXe5WDEiQfRX+Nk2vrp4ANrE4g1i59QIqmUPmYFisNENod52XS8iLlOPcB',
    'f5b29nRBROLpDngv2H6nX47HciuGVA3w3s84xPsoiUELfN3eFj7V3lug8PRC0iGQ',
    'fP+P9EHtjk8fuIfKz+nGQJnQ0QKBgQDWscmKKuBHTGJdD0q4ZmF7uWDgg3JcFtQK',
    'BrSlGBnBw+qHb1302bx1jMymk5b74V4PP57iuJHFaVQK1rSy6KkpbXTTCBn75/dg',
    'pwKBoxOqrlyjAFegakrSkJRJVvV2DZcuma6TFHbanjksLwl7JfsP8xTiwNuW4Gi5',
    'e8QTXZppcwKBgQCq/916XhtDK18gCBDyBqE/PFBP2XwRXhIoEeM84j5oouMgQmlY',
    'l2NzML7hOg3t8+3pqPMJ2ACpw/VEnVz/LKI4mIZKqiwg2vmGYApzUWKtaeo1OkYf',
    'o0K1vZuo7LT8QttRXYZ1YwxoTrc2EYRmqRmw2VZOIHHIYmtDdk5rdZZPkQKBgGXY',
    'ZuPdXRFVgd/lbiu1nY7krLk0gd5/kczDy5P5r9ZESxA+W1LYq1cUGMz4fIo2KbmQ',
    'E543sib0xUJzAbtRNVYKr32gfTsLmkVGVKEMrDquhhFpCyh049OpdD6qOrzqy4n2',
    'q2LoNU2V+0cjdRrvNH8ncAP1OvYCtIsw1B3frG1TAoGBAJheWDTMaVBLMPHWB/cl',
    'dX3gyYamNw00HC+irfp6LDNC6YRevCIhE/Mnt+hwtxefwfOo3flgpTheJPEvJ5s5',
    'yJHvOIONv9CwWbPVleFG6RiRBBKk2v0VlmfQP62q8SSKrRudXWBvhMpz4vcN/owY',
    'YG/3//ac/rqqLnhALzPFMqqd',
  ].join('\n');
  return {
    type: 'service_account',
    project_id: 'mapply-ce71a',
    private_key_id: '980022e3c232e709cdbbec3eea134ac1991a7c78',
    private_key: `-----BEGIN PRIVATE KEY-----\n${p}\n-----END PRIVATE KEY-----\n`,
    client_email: 'firebase-adminsdk-fbsvc@mapply-ce71a.iam.gserviceaccount.com',
    client_id: '109297552722051567760',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40mapply-ce71a.iam.gserviceaccount.com',
    universe_domain: 'googleapis.com',
  };
}

export function getDb() {
  if (!initialized) {
    let serviceAccount;

    const saPath = process.env.MAPPLY_SERVICE_ACCOUNT;
    if (saPath) {
      const resolved = saPath.startsWith('~')
        ? saPath.replace('~', process.env.HOME)
        : resolve(saPath);
      serviceAccount = JSON.parse(readFileSync(resolved, 'utf-8'));
    } else {
      serviceAccount = getBuiltinCredentials();
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    db = admin.firestore();
    initialized = true;
  }
  return db;
}

export function getUserId() {
  const uid = process.env.MAPPLY_USER_ID;
  if (!uid) {
    throw new Error('MAPPLY_USER_ID 환경변수가 설정되지 않았습니다.');
  }
  return uid;
}

export { admin };
