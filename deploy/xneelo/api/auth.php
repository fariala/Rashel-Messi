<?php

declare(strict_types=1);

function app_auth_encode(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function app_auth_sign(string $payload, string $secret): string
{
    return app_auth_encode(hash_hmac('sha256', $payload, $secret, true));
}

function app_auth_token(string $userId, bool $remember, string $secret): array
{
    $ttl = $remember ? 30 * 86400 : 12 * 3600;
    $now = time();
    $payload = app_auth_encode(json_encode([
        'sub' => $userId,
        'iat' => $now,
        'exp' => $now + $ttl,
        'jti' => bin2hex(random_bytes(9)),
    ], JSON_THROW_ON_ERROR));

    return ['token' => $payload . '.' . app_auth_sign($payload, $secret), 'expiresIn' => $ttl];
}

function app_auth_user_index(array $users, string $id): ?int
{
    foreach ($users as $index => $user) {
        if (($user['id'] ?? null) === $id) {
            return $index;
        }
    }
    return null;
}

function resolveSessionUser(array $ctx): ?array
{
    $authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    $bearer = preg_match('/^Bearer\s+(\S+)$/iD', trim($authorization), $match) ? $match[1] : '';
    $token = $bearer !== '' ? $bearer : ($_COOKIE['sas_token'] ?? '');
    if (!is_string($token) || !preg_match('/^([A-Za-z0-9_-]{1,1024})\.([A-Za-z0-9_-]{43})$/D', $token, $match)) {
        return null;
    }
    [, $body, $signature] = $match;
    if (!hash_equals(app_auth_sign($body, $ctx['config']['secret']), $signature)) {
        return null;
    }

    $decoded = base64_decode(strtr($body, '-_', '+/'), true);
    $payload = $decoded === false ? null : json_decode($decoded, true);
    if (!is_array($payload) || !is_string($payload['sub'] ?? null)
        || !is_int($payload['exp'] ?? null) || $payload['exp'] <= time()) {
        return null;
    }

    $users = $ctx['store']->read()['users'];
    $index = app_auth_user_index($users, $payload['sub']);
    return $index === null ? null : $users[$index];
}

function app_auth_cookie(array $ctx, string $token, int $ttl): void
{
    setcookie('sas_token', $token, [
        'expires' => $ttl > 0 ? time() + $ttl : time() - 3600,
        'path' => rtrim($ctx['basePath'], '/') . '/',
        'secure' => str_starts_with($ctx['origin'], 'https://'),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function app_auth_public_user(array $user): array
{
    return [
        'id' => $user['id'],
        'name' => $user['name'],
        'email' => $user['email'],
        'role' => $user['role'] ?? 'owner',
        'createdAt' => $user['createdAt'] ?? null,
        'lastLoginAt' => $user['lastLoginAt'] ?? null,
    ];
}

function app_auth_hash_password(string $password): string
{
    if (defined('PASSWORD_ARGON2ID')) {
        return password_hash($password, PASSWORD_ARGON2ID);
    }

    // Encode the full password before bcrypt, which only uses the first 72 bytes.
    return 'sas-bcrypt$' . password_hash(base64_encode(hash('sha384', $password, true)), PASSWORD_BCRYPT);
}

function app_auth_verify_password(string $password, mixed $hash): bool
{
    if (!is_string($hash)) {
        return false;
    }

    if (str_starts_with($hash, 'sas-bcrypt$')) {
        return password_verify(base64_encode(hash('sha384', $password, true)), substr($hash, strlen('sas-bcrypt$')));
    }
    return password_verify($password, $hash);
}

function app_auth_record_attempt(array &$db, string $key): int
{
    $now = time();
    $window = 600;
    $attempts = $db['authenticationAttempts'] ?? [];

    foreach ($attempts as $attemptKey => $attempt) {
        if ($now - $attempt['firstAt'] >= $window) {
            unset($attempts[$attemptKey]);
        }
    }

    $attempt = $attempts[$key] ?? ['count' => 0, 'firstAt' => $now];
    if ($attempt['count'] >= 8) {
        return (int) ceil(($window - ($now - $attempt['firstAt'])) / 60);
    }
    $attempt['count']++;
    $attempts[$key] = $attempt;
    $db['authenticationAttempts'] = $attempts;
    return 0;
}

function registerAuthRoutes(Router $router): void
{
    $router->post('/api/auth/login', static function (array $ctx): array {
        $email = app_email($ctx['body']['email'] ?? null);
        $password = app_string($ctx['body']['password'] ?? null, 200);
        if ($email === '' || $password === '') {
            throw new AppError(422, 'Email and password are required.', 'missing_credentials');
        }

        $rateKey = hash('sha256', $ctx['ip'] . ':' . $email);
        $wait = $ctx['store']->mutate(static fn (array &$db): int => app_auth_record_attempt($db, $rateKey));
        if ($wait > 0) {
            throw new AppError(429, "Too many login attempts. Please try again in {$wait} minute(s).", 'rate_limited');
        }

        $authenticated = null;
        foreach ($ctx['store']->read()['users'] as $user) {
            if (strtolower($user['email']) === $email) {
                $authenticated = $user;
                break;
            }
        }
        if (!$authenticated || !app_auth_verify_password($password, $authenticated['passwordHash'] ?? null)) {
            throw new AppError(401, 'Incorrect email or password.', 'invalid_credentials');
        }

        $updated = $ctx['store']->mutate(static function (array &$db) use ($authenticated, $rateKey): array {
            $index = app_auth_user_index($db['users'], $authenticated['id']);
            if ($index === null || $db['users'][$index]['passwordHash'] !== $authenticated['passwordHash']
                || $db['users'][$index]['email'] !== $authenticated['email']) {
                throw new AppError(401, 'Incorrect email or password.', 'invalid_credentials');
            }

            unset($db['authenticationAttempts'][$rateKey]);
            $db['users'][$index]['lastLoginAt'] = app_now();
            return app_auth_public_user($db['users'][$index]);
        });

        $session = app_auth_token($updated['id'], (bool) ($ctx['body']['remember'] ?? false), $ctx['config']['secret']);
        app_auth_cookie($ctx, $session['token'], $session['expiresIn']);
        return $session + ['user' => $updated];
    });

    $router->get('/api/auth/me', static fn (array $ctx): array => [
        'user' => app_auth_public_user($ctx['user']),
    ], true);

    $router->post('/api/auth/logout', static function (array $ctx): array {
        app_auth_cookie($ctx, '', 0);
        return ['ok' => true];
    });

    $router->patch('/api/auth/me', static function (array $ctx): array {
        $name = app_string($ctx['body']['name'] ?? null, 80);
        $email = app_email($ctx['body']['email'] ?? null);
        if (!preg_match('/^.{2}/us', $name)) {
            throw new AppError(422, 'Please provide your name.', 'invalid_name');
        }
        if ($email === '') {
            throw new AppError(422, 'Please provide a valid email address.', 'invalid_email');
        }

        $id = $ctx['user']['id'];
        $updated = $ctx['store']->mutate(static function (array &$db) use ($name, $email, $id): array {
            foreach ($db['users'] as $user) {
                if ($user['id'] !== $id && strtolower($user['email']) === $email) {
                    throw new AppError(409, 'That email is already used by another account.', 'email_taken');
                }
            }
            $index = app_auth_user_index($db['users'], $id);
            if ($index === null) {
                throw new AppError(401, 'Please sign in to continue.', 'unauthorized');
            }
            $db['users'][$index]['name'] = $name;
            $db['users'][$index]['email'] = $email;
            return app_auth_public_user($db['users'][$index]);
        });

        return ['user' => $updated];
    }, true);

    $router->post('/api/auth/password', static function (array $ctx): array {
        $current = app_string($ctx['body']['currentPassword'] ?? null, 200);
        $next = app_string($ctx['body']['newPassword'] ?? null, 200);
        if (!preg_match('/^.{8}/us', $next)) {
            throw new AppError(422, 'Your new password must be at least 8 characters.', 'weak_password');
        }
        if ($current === $next) {
            throw new AppError(422, 'Your new password must be different from the current one.', 'same_password');
        }

        $user = $ctx['user'];
        if (!app_auth_verify_password($current, $user['passwordHash'] ?? null)) {
            throw new AppError(401, 'Your current password is incorrect.', 'invalid_password');
        }
        $hash = app_auth_hash_password($next);
        $ctx['store']->mutate(static function (array &$db) use ($user, $hash): void {
            $index = app_auth_user_index($db['users'], $user['id']);
            if ($index === null || $db['users'][$index]['passwordHash'] !== $user['passwordHash']) {
                throw new AppError(401, 'Your current password is incorrect.', 'invalid_password');
            }
            $db['users'][$index]['passwordHash'] = $hash;
        });

        return ['ok' => true];
    }, true);
}
