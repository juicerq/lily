<img src="public/icon.svg" width="64" height="64" alt="Logo de Lily">

# Lily

[Português](README.md) · [English](README.en.md) · Español

Horarios y límites diarios para los sitios que te roban tiempo.

Extensión para Firefox y Zen, con interfaz monocromática y datos guardados en tu navegador. Hecha con Svelte 5, TypeScript y WXT.

[Descargar la última versión](https://github.com/juicerq/lily/releases/latest) · [Reglas y arquitectura (portugués)](docs/spec.md) · [Licencia MIT](LICENSE)

Disponible en español, inglés y portugués de Brasil. La interfaz sigue el idioma del navegador y usa inglés para los idiomas no compatibles. Las fechas siguen el idioma de la interfaz; las horas se muestran en formato de 24 horas, en tu zona horaria local, y la semana empieza el lunes.

## Cómo funciona

Pinta las horas de la semana en las que quieres evitar distracciones y define un límite diario para cada sitio. Por ejemplo: YouTube con 1h al día y bloqueado de 14:00 a 18:00. A las 15:00, Lily bloquea el acceso aunque quede tiempo; fuera de ese horario puedes usar el tiempo restante hasta que se agote el límite diario.

- **Cuadrícula semanal:** bloques de media hora, editables con ratón o teclado.
- **Límites diarios:** se reinician a medianoche. Un límite de 0 mantiene el sitio siempre bloqueado; sin límite, solo se aplican los horarios.
- **Tiempo de uso:** cuenta en la pestaña activa de la ventana en primer plano. Se pausa tras 60s sin interacción, salvo si se reproduce contenido multimedia.
- **Permitir 5 min:** espera de 30s con la página visible, hasta dos veces al día, fuera de los horarios bloqueados.
- **Avisos:** notificación 1 min antes de que empiece el horario bloqueado o se agote el límite diario.

### Tu semana

La página de la semana muestra el tiempo en cada sitio, día a día, frente a su límite. El mapa de medias horas muestra el uso y los intentos bloqueados. La lectura de la semana señala el tramo más usado fuera de los horarios y permite pintarlo con un clic. Guarda o copia un resumen PNG que muestra solo los sitios de la lista.

Ábrela desde la ventana emergente o la configuración. El historial conserva las últimas 12 semanas.

### Cuando es hora de parar

La pantalla de bloqueo explica el motivo y muestra cuándo estará disponible el sitio. Si alguien comparte una publicación de X o Instagram, «Ver solo esta publicación» la muestra sin el feed ni permitir el acceso al sitio. Los perfiles de Instagram funcionan igual con «Ver solo este perfil».

## Instalar

### Zen

1. Descarga el archivo `.xpi` en [Releases](https://github.com/juicerq/lily/releases/latest).
2. En `about:config`, cambia `xpinstall.signatures.required` a `false` para permitir el paquete sin firma.
3. En `about:addons`, abre el menú del engranaje → **Instalar complemento desde archivo** y elige el `.xpi`.

Después de instalar, el navegador consulta [`updates.json`](updates.json) para buscar nuevas versiones publicadas en este repositorio.

### Firefox

Requiere Firefox 140 o posterior.

## Privacidad

La configuración, los contadores, las últimas 12 semanas de historial y el registro de diagnóstico se guardan localmente en el navegador. El historial incluye tiempo por dominio de sitios fuera de la lista para sugerir nuevos sitios; nunca sale del navegador y la imagen exportada muestra solo los sitios de la lista. Lily no envía datos de uso a servidores, no usa analítica e incluye las fuentes en el paquete. El navegador consulta GitHub para actualizar las instalaciones por `.xpi`. Las publicaciones o perfiles insertados se cargan desde X o Instagram cuando eliges verlos.

Los permisos permiten observar pestañas y navegación para contar el uso y redirigir sitios bloqueados, detectar inactividad, programar bloqueos, guardar datos y mostrar avisos. Más detalles en la [especificación (portugués)](docs/spec.md).

## Licencia

Código bajo la [licencia MIT](LICENSE). Las fuentes Doto y Space Mono se distribuyen bajo la SIL Open Font License; los textos están en [`public/fonts`](public/fonts).
