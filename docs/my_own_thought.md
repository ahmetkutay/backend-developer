# Kendi Düşüncelerim — Bu Projeyi Nasıl Ele Aldım

Bu projeyi, istenilen gereksinimleri dikkatle okuyup önceliklendirerek ele aldım. Normalde verilen süre 8 saat olsa da, günümüz teknolojilerinin sağladığı verimlilik sayesinde yapay zeka araçlarını kullanarak işi çok daha hızlı tamamlayabildim. Sonrasında sistemi nasıl daha da geliştirebileceğimi düşündüm ve bu aşamada yine yapay zeka araçlarından yararlanarak farklı senaryoları gözden geçirdim.
Yapay zekayı kullanmaktaki amacım sadece “daha hızlı kod yazmak” değil; aynı zamanda klasik geliştirici bakış açısından bir adım geri çekilip daha sistemsel düşünmeyi, akışları uçtan uca tasarlamayı ve hata senaryolarını geniş açıyla ele almayı alışkanlık haline getirmekti.
Sistemi birçok kez çalıştırıp akışları test ettim; kuyruk tanımları, retry/DLQ, idempotency ve temel sağlık kontrolleri gibi kritik konularda bir sorunla karşılaşmadım.

## Kullandığım Araçlar
- JetBrains Junie
- JetBrains AI Assistant Chat

## Yaklaşımımın Özeti
- Gereksinimleri maddelere ayırıp önceliklendirdim (mesajlaşma sadece MQ, çekirdek event akışları, retry/DLQ, idempotency, readiness/liveness).
- Servis sınırları ve event akışlarını netleştirip, her akış için üretici/tüketici davranışlarını tanımladım.
- Olay şemalarını (v1) belirleyip, üretim öncesi ve tüketim anında doğrulamayı ekledim (runtime validation), böylece hatalı payload’ların sisteme girmesini engelledim.
- Dayanıklılık için retry/DLQ mantığı ve idempotent kayıt stratejisini uyguladım.
- Docker Compose ile hızlı şekilde ortamı kaldırıp indirgeyebilecek bir geliştirme/demonstrasyon düzeni kurdum.

## Doğrulama ve Kontroller
- Servis readiness/liveness uçları üzerinden sağlık takibi yaptım.
- Temel uçtan uca akışları (sipariş oluşturma/iptal, envanter onay/red, bildirim) hem HTTP hem de yardımcı script (scripts/mq-publish.sh) ile sınadım.
- RabbitMQ UI üzerinden kuyruk/mesaj durumlarını gözlemledim; retry ve DLQ davranışlarını kontrol ettim.

Eğer amacınız benim yazılım bilgimi ölçmekse, memnuniyetle aynı görevi 1 gün içinde tamamen kendi başıma (AI yardımı olmadan) geliştirip size teslim edebilirim. Böylece hem süreç hem de teknik tercihlerin gerekçelerini ayrıntılı şekilde gösterebilirim.

Bu notlar, değerlendirme sürecine şeffaflık katmak için yazılmıştır. Yapay zeka araçlarını, daha hızlı sonuç üretmenin ötesinde; sistemsel düşünmeyi, tasarım kalitesini ve hata senaryolarını geniş perspektifle ele almayı güçlendiren yardımcılar olarak gördüm. Gerektiğinde aynı çözümü tamamen manuel şekilde de uygulayabilirim.