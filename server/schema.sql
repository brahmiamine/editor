-- Schéma MariaDB de Papertrail. Idempotent : appliqué automatiquement au démarrage de l'API.

-- Comptes et sessions
CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(320) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3),
  UNIQUE KEY users_email_unique (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  KEY sessions_user_idx (user_id),
  CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_tokens (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  purpose ENUM('recovery', 'magic') NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  KEY email_tokens_user_idx (user_id),
  CONSTRAINT email_tokens_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Notes : l'API filtre toujours par user_id ; revision sert au contrôle de concurrence optimiste.
CREATE TABLE IF NOT EXISTS notes (
  user_id CHAR(36) NOT NULL,
  id CHAR(36) NOT NULL,
  title TEXT NOT NULL,
  body LONGTEXT NOT NULL,
  color VARCHAR(32) NOT NULL DEFAULT '#e9b949',
  metadata LONGTEXT NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1,
  updated_at DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3),
  PRIMARY KEY (user_id, id),
  CONSTRAINT notes_metadata_check CHECK (JSON_VALID(metadata)),
  CONSTRAINT notes_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Images privées des notes (1 Mo maximum chacune).
CREATE TABLE IF NOT EXISTS note_images (
  user_id CHAR(36) NOT NULL,
  id CHAR(36) NOT NULL,
  content_type VARCHAR(32) NOT NULL,
  data MEDIUMBLOB NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3),
  PRIMARY KEY (user_id, id),
  CONSTRAINT note_images_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Partages en lecture seule : seul le hachage SHA-256 du jeton est stocké.
CREATE TABLE IF NOT EXISTS note_shares (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  body LONGTEXT NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3),
  UNIQUE KEY note_shares_token_unique (token_hash),
  KEY note_shares_user_idx (user_id),
  CONSTRAINT note_shares_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
