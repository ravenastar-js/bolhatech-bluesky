> [!NOTE]
> "skywatch.bsky.social" foi incluso em [onlyoptin.json](./onlyoptin.json) como demonstração e exemplificação.

> [!IMPORTANT] 
> Caso seja seguidor(a) de [@bolhatech.blue](https://bsky.app/profile/bolhatech.blue) e não estiver presente na lista "onlyoptin" em [onlyoptin.json](./onlyoptin.json), `BolhaTech` irá repostar publicações que contenham tags, gatilhos e menções.

Caso queira impedir o repost de suas publicações que contenham tags e gatilhos, alternativamente poderá solicitar a inclusão na lista "onlyoptin" em [onlyoptin.json](./onlyoptin.json). Dessa forma, o bot não irá repostar nenhuma de suas publicações que contenham tags e gatilhos.

> É apenas um filtro. BolhaTech não bloqueará nenhum usuário e funcionará 100% "opt-in", ou seja, somente irá repostar sua publicação caso mencione @bolhatech.blue.

Entre em contato com [ravenastar.bolhatech.blue](https://bsky.app/profile/ravenastar.bolhatech.blue) para entrar na lista. Favor NÃO enviar PR (Pull Request) para [users.json](./users.json), somente mediante contato. Em [onlyoptin.json](./onlyoptin.json) o filtro será a partir do DID; portanto, o handler será apenas para identificar visualmente a quem pertence o DID.

> Utilizamos a plataforma [bsky-debug.app](https://bsky-debug.app) para obter o DID da sua conta. Não é possível alterar o DID, pois se trata de uma informação fixa desde a criação de sua conta. Já o handler pode ser alterado, o que torna inviável o filtro por handler. Por esse motivo, o filtro é aplicado ao DID.
