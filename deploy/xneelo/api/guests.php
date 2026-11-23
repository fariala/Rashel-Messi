<?php

declare(strict_types=1);

const APP_GUEST_CATEGORIES = ['Family', 'Friend', 'Colleague', 'VIP', 'Other'];

function app_find_id_index(array $items, string $id): ?int
{
    foreach ($items as $index => $item) {
        if (($item['id'] ?? null) === $id) {
            return $index;
        }
    }

    return null;
}

function app_guest_id_index(array $guests, string $id): int
{
    return app_find_id_index($guests, $id) ?? throw new AppError(404, 'Guest not found.', 'not_found');
}

function app_search_lower(string $value): string
{
    return function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
}

function app_summarise_guests(array $guests): array
{
    $summary = [
        'total' => count($guests),
        'seats' => 0,
        'invited' => 0,
        'attending' => 0,
        'declined' => 0,
        'pending' => 0,
        'checkedIn' => 0,
        'attendingSeats' => 0,
        'checkedInSeats' => 0,
        'categories' => array_fill_keys(APP_GUEST_CATEGORIES, 0),
    ];

    foreach ($guests as $guest) {
        $seats = (int) ($guest['seats'] ?? 0);
        $category = $guest['category'] ?? 'Other';
        $rsvpSeats = (int) ($guest['rsvpSeats'] ?? 0) ?: $seats;
        $status = $guest['rsvpStatus'] ?? 'pending';

        $summary['seats'] += $seats;
        $summary['categories'][$category] = ($summary['categories'][$category] ?? 0) + 1;
        if (!empty($guest['invitedAt'])) {
            $summary['invited']++;
        }
        if ($status === 'attending') {
            $summary['attending']++;
            $summary['attendingSeats'] += $rsvpSeats;
        } elseif ($status === 'declined') {
            $summary['declined']++;
        } else {
            $summary['pending']++;
        }

        if (!empty($guest['checkedInAt'])) {
            $summary['checkedIn']++;
            $summary['checkedInSeats'] += $rsvpSeats;
        }
    }

    return $summary;
}

function app_filter_guests(array $guests, array $query): array
{
    $search = app_search_lower(app_string($query['search'] ?? null, 80));
    $status = strtolower(app_string($query['status'] ?? null, 20, 'all'));
    $category = app_string($query['category'] ?? null, 30, 'all');
    $checkin = strtolower(app_string($query['checkin'] ?? null, 10, 'all'));

    return array_values(array_filter($guests, static function (array $guest) use ($search, $status, $category, $checkin): bool {
        if ($search !== '') {
            $fields = implode(' ', [$guest['name'], $guest['code'], $guest['phone'] ?? '', $guest['email'] ?? '']);
            if (!str_contains(app_search_lower($fields), $search)) {
                return false;
            }
        }

        return ($status === 'all' || $guest['rsvpStatus'] === $status)
            && ($category === 'all' || $guest['category'] === $category)
            && ($checkin !== 'yes' || !empty($guest['checkedInAt']))
            && ($checkin !== 'no' || empty($guest['checkedInAt']));
    }));
}

function app_sort_guests(array $guests, string $sort): array
{
    if ($sort === 'name') {
        $collator = class_exists(Collator::class) ? Collator::create('en') : null;
        usort($guests, static function (array $a, array $b) use ($collator): int {
            $ordered = $collator?->compare($a['name'], $b['name']);
            return is_int($ordered) ? $ordered : strcasecmp($a['name'], $b['name']);
        });
        return $guests;
    }

    $field = match ($sort) {
        'checkin' => 'checkedInAt',
        'rsvp' => 'rsvpAt',
        default => 'createdAt',
    };
    usort($guests, static fn (array $a, array $b): int => strcmp($b[$field] ?? '', $a[$field] ?? ''));

    return $guests;
}

function app_guest_payload(array $body, array $existing = []): array
{
    $name = app_string($body['name'] ?? null, 80);
    $length = function_exists('mb_strlen') ? mb_strlen($name, 'UTF-8') : strlen($name);
    if ($length < 2) {
        throw new AppError(422, 'Guest name must be at least 2 characters.', 'invalid_name');
    }

    $categoryName = app_string($body['category'] ?? null, 30, $existing['category'] ?? 'Friend');
    $category = 'Other';
    foreach (APP_GUEST_CATEGORIES as $label) {
        if (strcasecmp($label, $categoryName) === 0) {
            $category = $label;
            break;
        }
    }

    $status = strtolower(app_string($body['rsvpStatus'] ?? null, 20, $existing['rsvpStatus'] ?? 'pending'));
    return [
        'name' => $name,
        'category' => $category,
        'seats' => app_int($body['seats'] ?? null, 1, 12, ($existing['seats'] ?? 0) ?: 1),
        'phone' => preg_replace('/[^\d+\-()\s]/u', '', app_string($body['phone'] ?? null, 32)) ?? '',
        'email' => app_email($body['email'] ?? null),
        'note' => app_string($body['note'] ?? null, 300),
        'rsvpStatus' => in_array($status, ['pending', 'attending', 'declined'], true) ? $status : 'pending',
    ];
}

function app_unique_guest_code(array $guests): string
{
    $alphabet = 'ACDEFGHJKLMNPQRSTUVWXYZ23456789';
    $taken = array_fill_keys(array_map('strtoupper', array_column($guests, 'code')), true);
    for ($attempt = 0; $attempt < 50; $attempt++) {
        $code = 'SAS-';
        for ($position = 0; $position < 5; $position++) {
            $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        if (!isset($taken[$code])) {
            return $code;
        }
    }

    do {
        $code = 'SAS-' . strtoupper(bin2hex(random_bytes(8)));
    } while (isset($taken[$code]));

    return $code;
}

function app_new_guest(array $guests, array $payload, int $rsvpSeats, bool $invited): array
{
    $now = app_now();
    return [
        'id' => app_id('gst'),
        'code' => app_unique_guest_code($guests),
        ...$payload,
        'rsvpSeats' => $rsvpSeats,
        'message' => '',
        'invitedAt' => $invited ? $now : null,
        'rsvpAt' => null,
        'checkedInAt' => null,
        'createdAt' => $now,
        'updatedAt' => $now,
    ];
}

function app_csv_response(array $columns, array $rows, string $filename, array $headers = []): AppResponse
{
    $csvRow = static function (array $cells): string {
        return implode(',', array_map(static function ($value): string {
            $value = (string) ($value ?? '');
            return strpbrk($value, "\",\r\n") === false ? $value : '"' . str_replace('"', '""', $value) . '"';
        }, $cells));
    };

    $lines = [$csvRow(array_values($columns))];
    $keys = array_keys($columns);
    foreach ($rows as $row) {
        $lines[] = $csvRow(array_map(static fn (string $key) => $row[$key] ?? null, $keys));
    }

    return new AppResponse("\xEF\xBB\xBF" . implode("\r\n", $lines), 200, [
        'Content-Type' => 'text/csv; charset=utf-8',
        'Content-Disposition' => 'attachment; filename="' . $filename . '"',
        'Cache-Control' => 'no-store',
        ...$headers,
    ]);
}

function app_check_in_guest(array $ctx, ?string $id = null): array
{
    $result = $ctx['store']->mutate(static function (array &$db) use ($ctx, $id): array {
        if ($id !== null) {
            $index = app_guest_id_index($db['guests'], $id);
        } else {
            $code = app_string($ctx['body']['code'] ?? null, 400);
            $index = app_guest_index($db['guests'], $code);
            if ($index === null) {
                throw new AppError(404, 'That QR code is not linked to any guest.', 'guest_not_found');
            }
        }

        $guest = &$db['guests'][$index];
        $already = !empty($guest['checkedInAt']);
        if (!$already) {
            $now = app_now();
            $guest['checkedInAt'] = $now;
            $guest['updatedAt'] = $now;
            if (($guest['rsvpStatus'] ?? 'pending') === 'pending') {
                $guest['rsvpStatus'] = 'attending';
                $guest['rsvpSeats'] = ($guest['rsvpSeats'] ?? 0) ?: $guest['seats'];
                $guest['rsvpAt'] = $now;
            }
            app_activity($db, 'checkin', "{$guest['name']} checked in at the venue", ['guestId' => $guest['id']]);
        }

        return ['guest' => $guest, 'already' => $already];
    });

    $guest = $result['guest'];
    $result['link'] = app_invitation_link($ctx, $guest['code']);
    if ($id === null && $guest['rsvpStatus'] === 'declined') {
        $result['warning'] = "{$guest['name']} previously declined the invitation.";
    }

    return $result;
}

function registerGuestRoutes(Router $router): void
{
    $router->get('/api/admin/guests', static function (array $ctx): array {
        $db = $ctx['store']->read();
        $query = $ctx['query'];
        $page = app_int($query['page'] ?? null, 1, 100000, 1);
        $limit = app_int($query['limit'] ?? null, 5, 100, 10);
        $filtered = app_sort_guests(app_filter_guests($db['guests'], $query), app_string($query['sort'] ?? null, 20, 'recent'));
        $pages = max((int) ceil(count($filtered) / $limit), 1);
        $page = min($page, $pages);

        return [
            'items' => array_slice($filtered, ($page - 1) * $limit, $limit),
            'total' => count($filtered),
            'page' => $page,
            'pages' => $pages,
            'limit' => $limit,
            'summary' => app_summarise_guests($db['guests']),
            'filteredSummary' => app_summarise_guests($filtered),
            'categories' => APP_GUEST_CATEGORIES,
        ];
    }, true);

    $router->post('/api/admin/guests', static function (array $ctx): array {
        $payload = app_guest_payload($ctx['body']);
        $guest = $ctx['store']->mutate(static function (array &$db) use ($ctx, $payload): array {
            if ($payload['email'] !== '') {
                foreach ($db['guests'] as $item) {
                    if (strcasecmp($item['email'] ?? '', $payload['email']) === 0) {
                        throw new AppError(409, 'A guest with that email already exists.', 'duplicate_guest');
                    }
                }
            }

            $rsvpSeats = $payload['rsvpStatus'] === 'attending' ? $payload['seats'] : 0;
            $guest = app_new_guest($db['guests'], $payload, $rsvpSeats, !empty($ctx['body']['markInvited']));
            $db['guests'][] = $guest;
            app_activity($db, 'guest_added', "{$guest['name']} was added to the guest list", ['guestId' => $guest['id']]);
            return $guest;
        });

        return ['guest' => $guest, 'link' => app_invitation_link($ctx, $guest['code'])];
    }, true);

    $router->get('/api/admin/guests/export', static function (array $ctx): AppResponse {
        $db = $ctx['store']->read();
        $guests = app_sort_guests(app_filter_guests($db['guests'], $ctx['query']), 'name');
        return app_csv_response([
            'name' => 'Name',
            'code' => 'Invitation code',
            'phone' => 'Phone',
            'email' => 'Email',
            'category' => 'Category',
            'seats' => 'Seats',
            'rsvpStatus' => 'RSVP status',
            'rsvpSeats' => 'Confirmed seats',
            'invitedAt' => 'Invited at',
            'checkedInAt' => 'Checked in at',
            'note' => 'Notes',
        ], $guests, 'sas-guests.csv');
    }, true);

    $router->post('/api/admin/guests/import', static function (array $ctx): array {
        $rows = $ctx['body']['rows'] ?? null;
        if (!is_array($rows) || !array_is_list($rows) || !$rows) {
            throw new AppError(422, 'No guest rows were provided.', 'empty_import');
        }
        $rows = array_slice($rows, 0, 500);
        $invited = ($ctx['body']['markInvited'] ?? null) !== false;

        return $ctx['store']->mutate(static function (array &$db) use ($rows, $invited): array {
            $added = [];
            $skipped = [];
            $errors = [];
            foreach ($rows as $index => $row) {
                try {
                    $payload = app_guest_payload(is_array($row) ? $row : []);
                } catch (AppError $error) {
                    $errors[] = 'Row ' . ($index + 1) . ': ' . $error->getMessage();
                    continue;
                }

                $name = app_search_lower($payload['name']);
                foreach ($db['guests'] as $guest) {
                    if (app_search_lower($guest['name']) === $name
                        || ($payload['phone'] !== '' && ($guest['phone'] ?? '') === $payload['phone'])
                        || ($payload['email'] !== '' && ($guest['email'] ?? '') === $payload['email'])) {
                        $skipped[] = "{$payload['name']} is already on the list";
                        continue 2;
                    }
                }

                $guest = app_new_guest($db['guests'], $payload, 0, $invited);
                $db['guests'][] = $guest;
                $added[] = $guest;
            }
            if ($added) {
                app_activity($db, 'guest_import', count($added) . ' guest(s) imported from CSV');
            }

            return [
                'added' => count($added),
                'skipped' => count($skipped),
                'failed' => count($errors),
                'skippedDetails' => $skipped,
                'errors' => $errors,
                'items' => $added,
            ];
        });
    }, true);

    $router->patch('/api/admin/guests/:id', static function (array $ctx): array {
        $guest = $ctx['store']->mutate(static function (array &$db) use ($ctx): array {
            $index = app_guest_id_index($db['guests'], $ctx['params']['id']);
            $guest = &$db['guests'][$index];
            $payload = app_guest_payload(array_replace($guest, $ctx['body']), $guest);
            if ($payload['email'] !== '') {
                foreach ($db['guests'] as $item) {
                    if ($item['id'] !== $guest['id'] && strcasecmp($item['email'] ?? '', $payload['email']) === 0) {
                        throw new AppError(409, 'Another guest already uses that email.', 'duplicate_guest');
                    }
                }
            }

            $now = app_now();
            $guest = array_replace($guest, $payload, ['updatedAt' => $now]);
            $guest['rsvpSeats'] = $guest['rsvpStatus'] === 'attending'
                ? min($payload['seats'], max(($guest['rsvpSeats'] ?? 0) ?: $payload['seats'], 1))
                : 0;
            if ($guest['rsvpStatus'] !== 'pending') {
                $guest['rsvpAt'] = ($guest['rsvpAt'] ?? null) ?: $now;
            }

            $markInvited = $ctx['body']['markInvited'] ?? null;
            if ($markInvited === true && empty($guest['invitedAt'])) {
                $guest['invitedAt'] = $now;
                app_activity($db, 'invitation_sent', "Invitation sent to {$guest['name']}", ['guestId' => $guest['id']]);
            } elseif ($markInvited === false) {
                $guest['invitedAt'] = null;
            }

            return $guest;
        });

        return ['guest' => $guest, 'link' => app_invitation_link($ctx, $guest['code'])];
    }, true);

    $router->delete('/api/admin/guests/:id', static function (array $ctx): array {
        $ctx['store']->mutate(static function (array &$db) use ($ctx): void {
            $index = app_guest_id_index($db['guests'], $ctx['params']['id']);
            [$guest] = array_splice($db['guests'], $index, 1);
            $db['rsvps'] = array_values(array_filter(
                $db['rsvps'],
                static fn (array $rsvp): bool => ($rsvp['guestId'] ?? null) !== $guest['id']
            ));
            app_activity($db, 'guest_removed', "{$guest['name']} was removed from the guest list");
        });
        return ['ok' => true];
    }, true);

    $router->get('/api/admin/guests/:id/qr', static function (array $ctx): array|AppResponse {
        $db = $ctx['store']->read();
        $index = app_guest_id_index($db['guests'], $ctx['params']['id']);
        $guest = $db['guests'][$index];
        $link = app_invitation_link($ctx, $guest['code']);
        $format = strtolower(app_string($ctx['query']['format'] ?? null, 10, 'json'));
        $width = app_int($ctx['query']['width'] ?? null, 160, 1400, 640);

        if ($format === 'png') {
            return new AppResponse(app_qr_png($link, $width), 200, [
                'Content-Type' => 'image/png',
                'Content-Disposition' => 'inline; filename="' . $guest['code'] . '.png"',
                'Cache-Control' => 'private, max-age=300',
            ]);
        }
        if ($format === 'svg') {
            return new AppResponse(app_qr_svg($link), 200, [
                'Content-Type' => 'image/svg+xml',
                'Cache-Control' => 'private, max-age=300',
            ]);
        }

        return [
            'code' => $guest['code'],
            'name' => $guest['name'],
            'link' => $link,
            'dataUrl' => app_qr_data_url($link, $width),
        ];
    }, true);

    $router->post('/api/admin/guests/:id/checkin', static fn (array $ctx): array => app_check_in_guest($ctx, $ctx['params']['id']), true);

    $router->post('/api/admin/guests/:id/checkout', static function (array $ctx): array {
        $guest = $ctx['store']->mutate(static function (array &$db) use ($ctx): array {
            $index = app_guest_id_index($db['guests'], $ctx['params']['id']);
            $guest = &$db['guests'][$index];
            $guest['checkedInAt'] = null;
            $guest['updatedAt'] = app_now();
            app_activity($db, 'checkout', "{$guest['name']}'s check-in was undone", ['guestId' => $guest['id']]);

            return $guest;
        });
        return ['guest' => $guest];
    }, true);

    $router->post('/api/admin/checkin', static fn (array $ctx): array => app_check_in_guest($ctx), true);
}
