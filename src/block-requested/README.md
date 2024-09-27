> [!NOTE]
> O bloqueio de "skywatch.bsky.social" em [users.json](./users.json) foi usado como demonstração e exemplificação.

Caso não queira bloquear [@bolhatech.pages.dev](https://bsky.app/profile/bolhatech.pages.dev) para impedir reposts de publicações, alternativamente você poderá solicitar para entrar na lista de bloqueios em [users.json](./users.json). Com isso, o bot não irá repostar nenhuma de suas publicações sem a necessidade de bloqueá-lo.

É necessário informar o handler e o DID no privado de [ravenastar.pages.dev](https://bsky.app/profile/ravenastar.pages.dev). Favor NÃO enviar PR (Pull Request) para [users.json](./users.json), a solicitação não é via PR, é somente mediante contato. Basta acessar o [bsky-debug.app](https://bsky-debug.app) para obter o seu "DID". O bloqueio será a partir do DID; portanto, o handler será apenas para identificar visualmente a quem pertence o DID.