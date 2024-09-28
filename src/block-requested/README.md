> [!NOTE]
> O bloqueio de "skywatch.bsky.social" em [users.json](./users.json) foi usado como demonstração e exemplificação.

Caso não deseje bloquear [@bolhatech.pages.dev](https://bsky.app/profile/bolhatech.pages.dev) e queira impedir o repost de suas publicações, alternativamente poderá solicitar a inclusão na lista de bloqueios em [users.json](./users.json). Dessa forma, o bot não irá repostar nenhuma de suas publicações, sem a necessidade de bloqueá-lo.

> É apenas um filtro. O bot não bloqueará nenhum usuário e funcionará 100% "opt-in", ou seja, o bot somente irá repostar sua publicação caso mencione @bolhatech.pages.dev.

Entre em contato com [ravenastar.pages.dev](https://bsky.app/profile/ravenastar.pages.dev) para entrar na lista. Favor NÃO enviar PR (Pull Request) para [users.json](./users.json), somente mediante contato. Em [users.json](./users.json) o bloqueio será a partir do DID; portanto, o handler será apenas para identificar visualmente a quem pertence o DID.

> Utilizamos a plataforma [bsky-debug.app](https://bsky-debug.app) para obter o DID da sua conta. Não é possível alterar o DID, pois se trata de uma informação fixa desde a criação de sua conta. Já o handler pode ser alterado, o que torna inviável o bloqueio por handler. Por esse motivo, o filtro é aplicado ao DID.
