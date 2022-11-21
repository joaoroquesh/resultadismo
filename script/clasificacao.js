$( document ).ready(function() {

  const url ='https://script.googleusercontent.com/macros/echo?user_content_key=LjTtc6OpvJI3Jqp4wK3fpWlrFnFIpuEfsvtU5MMdo7q39FsAwePEXzubU2GjsUikMqqOO--9v7HcODnkRX0cCzZCeykwZmWnm5_BxDlH2jW0nuo2oDemN9CCS2h10ox_1xSncGQajx_ryfhECjZEnOrK8Sz279c9adskH55hnF9MoYrHD91IwEBnMTZfHczrkUqwBVuHtBfz7K7OVHY-GrmsLHKHXYNERl2louKEv-oPp-vE3a0lxdz9Jw9Md8uu&lib=MZJdNykQjw8RX6aFaQzkrGvlUalP-BxzV';

   var model = "<tr><th scope='row'>{pos}</th>"+
              "<td>{usuario}</td>"+
              "<td scope='row'>{ponto}</td>"+
              "<td scope='row'>{cravadas}</td>"+
              "<td scope='row'>{saldo}</td>"+
              "<td scope='row'>{acertos}</td></tr>";
            


  $(".list-results-content").empty();  


      fetch(url).then(rep => rep.json())
          .then((data) => {
              data.data.forEach((el) => {
                
                 line = model;
                 line = line.replace("{pos}", el.pos);
                 line = line.replace("{usuario}", el.usuario);
                 line = line.replace("{nome}", el.nome);
                 line = line.replace("{ponto}", el.ponto);
                 line = line.replace("{cravadas}", el.cravadas);
                 line = line.replace("{saldo}", el.saldo);
                 line = line.replace("{acertos}", el.acertos);
                 $(".infos-dados").append(line);

                  
              })
          })
          


});  


/*
const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c3IiOiJqb2Fvcm9xdWUiLCJpYXQiOjE2NjkwNDkzNzUsImV4cCI6MTY2OTEzNTc3NX0.-WzX-jk8ZQHiCNq6Z8mH8RjUOO2zmlR3HDPlbKAc1Kw'
    },
    body: '{"query":"query users {\n\tusers{\n\t\tusername\n\t\tfirst_name\n\t\tpoints{\n\t\t\ttotal\n\t\t\tscores{\n\t\t\t\tfixture_id\n\t\t\t\tresult\n\t\t\t}\n\t\t}\n\t}\n}","operationName":"users"}'
  };
  
  fetch('http://144.22.227.82:50080/api', options)
    .then(response => response.json())
    .then(response => console.log(response))
    .catch(err => console.error(err));
    */